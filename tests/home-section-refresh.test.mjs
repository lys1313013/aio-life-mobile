import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

// Execute the page's real loader with controlled requests; no copied implementation.
const source = await readFile(new URL('../src/pages/home/index.uvue', import.meta.url), 'utf8')
const loader = source.slice(source.indexOf('async function loadSection('), source.indexOf('\nasync function loadMore('))
const code = (await transform(`
export function fixture(getTime) {
  const states = {time: {loading:false,error:'',loaded:false,revision:-1}};
  const time = {value:{records:[]}}, timeDate = {value:''}, sectionVersions = {};
  let revision = 0, homeGeneration = 0, active = true;
  const session = {token:'fixture'}, editVersions = {}, pageVersions = {};
  const sectionEnabled = () => true, todayDate = () => '2026-10-05';
  const isCurrent = token => active && token === session.token;
  const homeDataRevision = () => revision, handleError = error => error.message;
  const timeSummary = (_categories, records) => ({records});
  const requireHomeAccess = async () => {}, blockedHomePath = () => '', sectionRoutes = {time:[]};
  const homeScheduler = {settled:()=>{}}, syncHomeSchedule = () => {};
  const lockSection = () => {states.time.locked=true};
  ${loader}
  return {states,time,timeDate,loadSection,write:()=>revision++,hide:()=>{active=false;homeGeneration++}};
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
