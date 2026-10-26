import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { reactive, watch } from 'vue'

const source = await readFile(new URL('../src/services/quick-nav-candidates.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'cjs' })
const entries = [{ menuId: '9223372036854775807', path: '/my-hub/memo', title: '模拟笔记' }]
function setup() {
  const session = reactive({ token: 'mock-account-a' })
  let now = 1000, revision = 0, calls = 0
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', code)(name => {
    if (name === 'vue') return { watch }
    if (name === './session.ts') return { session }
    if (name === './home-refresh.ts') return { homeDataRevision: () => revision }
    throw Error(name)
  }, module, module.exports, { now: () => now })
  const fetch = async path => {
    assert.equal(path, '/quick-nav/candidates?client=mobile')
    calls++
    return entries
  }
  return { ...module.exports, session, fetch, calls: () => calls,
    advance: ms => { now += ms }, changeAccess: () => { revision++ } }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('首页多个卡片并发仅请求一次，缓存60秒且不滑动续期', async () => {
  const c = setup(), gate = deferred()
  let calls = 0
  const fetch = () => { calls++; return gate.promise }
  const requests = Array.from({ length: 20 }, () => c.loadQuickNavCandidates(fetch))
  assert.equal(new Set(requests).size, 1)
  assert.equal(calls, 1)
  gate.resolve(entries)
  await Promise.all(requests)
  c.advance(59999)
  assert.equal(await c.loadQuickNavCandidates(c.fetch), entries)
  assert.equal(c.calls(), 0)
  c.advance(1)
  await Promise.all(Array.from({ length: 20 }, () => c.loadQuickNavCandidates(c.fetch)))
  assert.equal(c.calls(), 1)
})

test('空候选列表也复用，失败或异常响应不缓存且可重试', async () => {
  const empty = setup()
  await empty.loadQuickNavCandidates(async () => [])
  assert.deepEqual(await empty.loadQuickNavCandidates(empty.fetch), [])
  assert.equal(empty.calls(), 0)
  const c = setup(), gate = deferred()
  const pending = c.loadQuickNavCandidates(() => gate.promise)
  const rejected = assert.rejects(pending, /模拟网络失败/)
  gate.reject(Error('模拟网络失败'))
  await rejected
  for (const invalid of [null, {}, [null], [{ path: 123 }]])
    await assert.rejects(c.loadQuickNavCandidates(async () => invalid), /数据异常/)
  assert.equal(await c.loadQuickNavCandidates(c.fetch), entries)
  assert.equal(c.calls(), 1)
})

test('切换账号丢弃迟到结果，旧请求不能清理新账号的在途请求', async () => {
  const c = setup(), oldGate = deferred(), newGate = deferred()
  const old = c.loadQuickNavCandidates(() => oldGate.promise)
  const rejected = assert.rejects(old, /状态已变化/)
  c.session.token = 'mock-account-b'
  const current = c.loadQuickNavCandidates(() => newGate.promise)
  oldGate.resolve(entries)
  await rejected
  assert.equal(c.loadQuickNavCandidates(c.fetch), current)
  const fresh = [{ path: '/record/movie' }]
  newGate.resolve(fresh)
  assert.equal(await current, fresh)
  assert.equal(await c.loadQuickNavCandidates(c.fetch), fresh)
  assert.equal(c.calls(), 0)
  c.session.token = ''
  await assert.rejects(c.loadQuickNavCandidates(c.fetch), /登录状态已变化/)
  c.session.token = 'mock-account-b'
  await c.loadQuickNavCandidates(c.fetch)
  assert.equal(c.calls(), 1)
})

test('菜单权限变化立即失效，并发调用仍只重拉一次', async () => {
  const c = setup()
  await c.loadQuickNavCandidates(c.fetch)
  c.changeAccess()
  await Promise.all(Array.from({ length: 20 }, () => c.loadQuickNavCandidates(c.fetch)))
  assert.equal(c.calls(), 2)
})

test('权限变化后的旧响应不能写入缓存或清除新请求', async () => {
  const c = setup(), oldGate = deferred(), newGate = deferred()
  const old = c.loadQuickNavCandidates(() => oldGate.promise)
  const rejected = assert.rejects(old, /权限或登录状态已变化/)
  c.changeAccess()
  const current = c.loadQuickNavCandidates(() => newGate.promise)
  oldGate.resolve(entries)
  await rejected
  assert.equal(c.loadQuickNavCandidates(c.fetch), current)
  newGate.resolve([])
  assert.deepEqual(await current, [])
  assert.deepEqual(await c.loadQuickNavCandidates(c.fetch), [])
  assert.equal(c.calls(), 0)
})

test('权限变化时即使尚未发起新读取，也拒绝旧响应', async () => {
  const c = setup(), gate = deferred()
  const old = c.loadQuickNavCandidates(() => gate.promise)
  const rejected = assert.rejects(old, /权限或登录状态已变化/)
  c.changeAccess()
  gate.resolve(entries)
  await rejected
  await c.loadQuickNavCandidates(c.fetch)
  assert.equal(c.calls(), 1)
})
