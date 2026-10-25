import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

// Execute the page's real loader with controlled requests; no copied implementation.
const source = await readFile(new URL('../src/pages/home/index.uvue', import.meta.url), 'utf8')
const loader = source.slice(source.indexOf('async function loadSection('), source.indexOf('\nasync function loadMore('))
const complete = source.slice(source.indexOf('async function completeWatched('), source.indexOf('\nfunction overviewVisual('))
const code = (await transform(`
export function fixture(getTime, getWatched, update = async () => true) {
  const states = {time: {loading:false,error:'',loaded:false,revision:-1},watched:{loading:false,error:'',loaded:true,revision:0}};
  const time = {value:{records:[]}}, timeDate = {value:''}, selectedTimeDate = {value:''}, sectionVersions = {};
  const watched = {value:[{id:'9223372036854775807',content:'模拟待办',isCompleted:0}]}, taskBusy = {value:''};
  let revision = 0, homeGeneration = 0, active = true;
  const session = {token:'fixture'}, editVersions = {watched:0}, pageVersions = {};
  const request = async (...args) => {const result = await update(...args);revision++;return result};
  const sectionEnabled = () => true, todayDate = () => '2026-10-05';
  const isCurrent = token => active && token === session.token;
  const homeDataRevision = () => revision, handleError = error => error.message;
  const timeSummary = (_categories, records) => ({records});
  const requireHomeAccess = async () => {}, blockedHomePath = () => '', sectionRoutes = {time:[]};
  const homeScheduler = {settled:()=>{}}, syncHomeSchedule = () => {};
  const lockSection = () => {states.time.locked=true};
  ${loader}
  ${complete}
  return {states,time,timeDate,watched,taskBusy,loadSection,completeWatched,write:()=>revision++,hide:()=>{active=false;homeGeneration++}};
}`, {loader:'ts',format:'esm'})).code
const { fixture } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const gate = () => {let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const result = id => ({categories:[],records:[{id}]})

test('保存后的刷新不会被旧 loading 吞掉，旧响应与 finally 不覆盖新请求', async () => {
  const old=gate(), fresh=gate();let calls=0;
  const page=fixture(()=> ++calls===1 ? old.promise : fresh.promise)
  const first=page.loadSection('time');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);page.write();const afterWrite=page.loadSection('time',true)
  old.resolve(result('old'));await first
  assert.equal(page.states.time.loading,true);assert.deepEqual(page.time.value.records,[])
  fresh.resolve(result('new'));await afterWrite
  assert.deepEqual(page.time.value.records,[{id:'new'}]);assert.equal(page.states.time.loading,false)
})
test('请求期间数据版本变化会补刷，即使普通刷新被合并也不会漏更新', async () => {
  const old=gate();let calls=0
  const page=fixture(()=> ++calls===1 ? old.promise : Promise.resolve(result('new')))
  const first=page.loadSection('time');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);page.write();await page.loadSection('time')
  old.resolve(result('old'));await first;await new Promise(resolve=>setImmediate(resolve))
  assert.equal(calls,2);assert.deepEqual(page.time.value.records,[{id:'new'}])
})
test('刷新失败保留内容，离页后不补刷、不写回', async () => {
  let next=Promise.resolve(result('record'));let calls=0
  const page=fixture(()=>{calls++;return next})
  await page.loadSection('time');next=Promise.reject(Error('offline'));await page.loadSection('time')
  assert.deepEqual(page.time.value.records,[{id:'record'}]);assert.equal(page.states.time.error,'offline')
  const old=gate();next=old.promise;const pending=page.loadSection('time');await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,3);page.write();page.hide();old.resolve(result('late'));await pending
  assert.equal(calls,3);assert.deepEqual(page.time.value.records,[{id:'record'}])
})

test('待办完成保留原条目，可取消完成，下一次刷新才移除', async () => {
  const writes=[];let reads=0
  const page=fixture(null,async()=>{reads++;return []},async(...args)=>writes.push(args))
  await page.completeWatched(page.watched.value[0])
  assert.equal(page.watched.value[0].isCompleted,1)
  assert.equal(reads,0)
  assert.deepEqual(writes[0],['/taskDetails','PUT',{id:'9223372036854775807',isCompleted:1}])
  await page.completeWatched(page.watched.value[0])
  assert.equal(page.watched.value[0].isCompleted,0)
  assert.equal(writes[1][2].isCompleted,0)
  await page.completeWatched(page.watched.value[0])
  await page.loadSection('watched')
  assert.deepEqual(page.watched.value,[])
  assert.equal(reads,1)
})

test('完成期间旧查询失效，不覆盖已勾选条目或触发立即补刷', async () => {
  const old=gate();let reads=0
  const page=fixture(null,()=>{reads++;return old.promise})
  const refresh=page.loadSection('watched')
  await new Promise(resolve=>setImmediate(resolve))
  await page.completeWatched(page.watched.value[0])
  old.resolve([]);await refresh
  assert.equal(page.watched.value[0].isCompleted,1)
  assert.equal(page.states.watched.loading,false)
  assert.equal(page.states.watched.revision,1)
  assert.equal(reads,1)
})

test('完成失败保留原状态并可重试，请求中不重复提交，离页后不写回', async () => {
  let calls=0;const save=gate()
  const page=fixture(null,async()=>[],()=>{calls++;if(calls===1)throw Error('offline');return save.promise})
  await page.completeWatched(page.watched.value[0])
  assert.equal(page.watched.value[0].isCompleted,0)
  assert.equal(page.states.watched.error,'offline')
  const retry=page.completeWatched(page.watched.value[0])
  assert.equal(page.taskBusy.value,'9223372036854775807')
  await page.completeWatched(page.watched.value[0]);assert.equal(calls,2)
  page.hide();save.resolve(true);await retry
  assert.equal(page.watched.value[0].isCompleted,0)
  assert.equal(page.taskBusy.value,'')
})
