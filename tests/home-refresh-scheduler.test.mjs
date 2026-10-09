import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const source = await readFile(new URL('../src/pages/home/services/refresh-scheduler.ts', import.meta.url), 'utf8')
const code = (await transform(source, {loader:'ts',format:'esm'})).code
const { createHomeRefreshScheduler, refreshIntervalMs, homeSectionRefreshSeconds } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const flush = async () => { for (let i=0;i<10;i++) await Promise.resolve() }
function fixture() {
  let now=0, id=0;const timers=new Map()
  const scheduler=createHomeRefreshScheduler({now:()=>now,set:(callback,delay)=>{const key=++id;timers.set(key,{at:now+delay,callback});return key},cancel:key=>timers.delete(key)})
  return { scheduler, get timers(){return timers.size}, async advance(ms){
    const end=now+ms
    while (true) {
      const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0]
      if (!next || next[1].at>end) break
      now=next[1].at;timers.delete(next[0]);next[1].callback();await flush()
    }
    now=end;await flush()
  }}
}
test('概览秒数严格校验，内容刷新周期与 Web 一致',()=>{
  assert.equal(refreshIntervalMs(300),300000);assert.equal(refreshIntervalMs(600),600000)
  for (const value of [null,undefined,0,-1,'300',NaN,Infinity,2147484])assert.equal(refreshIntervalMs(value),0)
  assert.deepEqual(homeSectionRefreshSeconds,{time:300,exercise:600,watched:1800,thoughts:3600,commits:3600})
})
test('持续前台按单卡周期查询，手动刷新更新时间且动态间隔替换不叠加',async()=>{
  const f=fixture();let a=0,b=0
  f.scheduler.set('a',300,()=>a++);f.scheduler.set('b',600,()=>b++);f.scheduler.resume()
  await f.advance(299999);assert.deepEqual([a,b],[0,0])
  await f.advance(1);assert.deepEqual([a,b],[1,0])
  await f.advance(100000);f.scheduler.settled('a')
  await f.advance(200000);assert.deepEqual([a,b],[1,1])
  f.scheduler.set('a',600,()=>a++);assert.equal(f.timers,2)
  await f.advance(399999);assert.equal(a,1)
  await f.advance(1);assert.equal(a,2)
  f.scheduler.set('a',0,()=>a++);assert.equal(f.timers,1)
  await f.advance(1200000);assert.equal(a,2)
})
test('后台不查询，恢复到期只补刷一次，未到期短返回保留剩余时间',async()=>{
  const f=fixture();let calls=0
  f.scheduler.set('time',300,()=>calls++);f.scheduler.resume();await f.advance(100000)
  f.scheduler.pause();await f.advance(50000);assert.equal(f.timers,0)
  f.scheduler.resume();f.scheduler.resume();await f.advance(149999);assert.equal(calls,0)
  await f.advance(1);assert.equal(calls,1)
  f.scheduler.pause();await f.advance(600000);assert.equal(calls,1);assert.equal(f.scheduler.due('time'),true)
  f.scheduler.resume();await f.advance(0);assert.equal(calls,2);assert.equal(f.timers,1)
})
test('请求未完成不重复调度，失败按周期恢复，停用与旧 finally 不重建任务',async()=>{
  const f=fixture();let calls=0,release
  f.scheduler.set('a',1,()=>{calls++;return new Promise(resolve=>{release=resolve})});f.scheduler.resume()
  await f.advance(1000);await f.advance(5000);assert.equal(calls,1);assert.equal(f.timers,0)
  f.scheduler.set('a',0,()=>{});release();await flush();assert.equal(f.timers,0)
  f.scheduler.set('a',1,()=>{calls++;throw Error('offline')});await f.advance(1000)
  assert.equal(calls,2);await f.advance(1000);assert.equal(calls,3)
  f.scheduler.clear();await f.advance(10000);assert.equal(calls,3);assert.equal(f.timers,0)
})
test('离页期间旧请求收尾不能改变恢复后的调度',async()=>{
  const f=fixture();let release,calls=0
  f.scheduler.set('a',1,()=>++calls===1?new Promise(resolve=>{release=resolve}):undefined);f.scheduler.resume()
  await f.advance(1000);f.scheduler.pause();await f.advance(1000);f.scheduler.resume();await f.advance(0)
  assert.equal(calls,2);release();await flush();assert.equal(f.timers,1)
  await f.advance(1000);assert.equal(calls,3)
})
