import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return moduleUrl((await transform(source, { loader: 'ts', format: 'esm' })).code)
}
const contractUrl = await sourceModule('../src/services/contract.ts')
const payloadUrl = await sourceModule('../src/services/api-payload.ts')
const source = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
const prelude = `
import { readResponse as parseResponse, readUser } from '${contractUrl}';
import { minimalRequestPayload } from '${payloadUrl}';
export const fixture = {
  session: { token: 'fixture-token' }, revision: 0, calls: [], timers: [], delays: [],
  parsed: 0, updates: 0, unlocks: 0, cleared: 0, redirects: [], invalidations: 0,
  handle: null, unlock: () => Promise.resolve(),
};
const session = fixture.session;
const uni = {
  request(options) { fixture.calls.push(options); fixture.handle(options); },
  reLaunch(options) { fixture.redirects.push(options.url); },
};
const setTimeout = (fn, delay) => { fixture.delays.push(delay); fixture.timers.push(fn); };
const readResponse = (status, body) => { fixture.parsed++; return parseResponse(status, body); };
const unlockNavigationRevision = () => fixture.revision;
const requestUnlock = () => { fixture.unlocks++; return fixture.unlock(); };
const clearSession = () => { fixture.cleared++; session.token = ''; };
const saveToken = token => { session.token = token; };
const menuVisuals = { afterWrite() { fixture.updates++; } };
const invalidateMenuAccessAfterWrite = () => {};
const invalidateHomeAfterWrite = () => {};
const invalidatePageAfterWrite = () => {};
const invalidateMenuAccessCache = () => { fixture.invalidations++; };
`
const compiled = (await transform(prelude + source.replace(/^import .*\n/gm, '').replaceAll('import.meta.env', '{}'), { loader: 'ts', format: 'esm' })).code
let instance = 0
async function harness(handle) {
  const api = await import(moduleUrl(compiled) + '#' + instance++)
  api.fixture.handle = handle
  return { ...api, tick: () => { assert.ok(api.fixture.timers.length); api.fixture.timers.shift()() } }
}
const ok = options => options.success({ statusCode: 200, data: { code: 0, data: { id: '9007199254740993' } } })
const response = (statusCode, data = {}) => options => options.success({ statusCode, data })

for (const [label, fail] of [
  ['500', response(500)], ['502', response(502)], ['503', response(503)],
  ['网络失败', options => options.fail({ errMsg: 'request:fail network error' })],
  ['超时', options => options.fail({ errMsg: 'request:fail timeout' })],
]) {
  test(`GET ${label} 后成功：保留参数、超时和字符串 ID，只解包及通知一次`, async () => {
    const { request, fixture, tick } = await harness(fail)
    const pending = request('/movie/page', 'GET', { page: 2, activeOnly: false }, true, null, false, 2345)
    let settled = false
    pending.then(() => { settled = true })
    await Promise.resolve()
    assert.equal(settled, false)
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.parsed, 0)
    assert.equal(fixture.updates, 0)
    fixture.handle = ok
    tick()
    assert.deepEqual(await pending, { id: '9007199254740993' })
    assert.deepEqual(fixture.delays, [300])
    assert.equal(fixture.calls.length, 2)
    for (const call of fixture.calls) {
      assert.equal(call.header.Authorization, 'Bearer fixture-token')
      assert.deepEqual(call.data, { page: 2, activeOnly: false })
      assert.equal(call.timeout, 2345)
    }
    assert.equal(fixture.parsed, 1)
    assert.equal(fixture.updates, 1)
  })
}

for (const [label, fail, message] of [
  ['503', response(503), /服务暂时不可用/],
  ['网络失败', options => options.fail({ errMsg: 'request:fail network error' }), /连接失败/],
]) {
  test(`GET ${label} 持续失败：最多四次尝试，300/600/1200ms 退避后拒绝`, async () => {
    const { request, fixture, tick } = await harness(fail)
    const pending = request('/user/info')
    const rejected = assert.rejects(pending, message)
    for (let i = 0; i < 3; i++) { assert.equal(fixture.calls.length, i + 1); tick() }
    await rejected
    assert.equal(fixture.calls.length, 4)
    assert.deepEqual(fixture.delays, [300, 600, 1200])
    assert.equal(fixture.timers.length, 0)
    assert.equal(fixture.updates, 0)
  })
}

test('非 GET 的服务器故障和网络失败均不重发', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    for (const fail of [response(503), options => options.fail({ errMsg: 'request:fail timeout' })]) {
      const { request, fixture } = await harness(fail)
      await assert.rejects(request('/tasks/1', method))
      assert.equal(fixture.calls.length, 1)
      assert.equal(fixture.timers.length, 0)
    }
  }
})

test('4xx、业务失败和响应格式异常不重试；401 保留清理会话和登录跳转', async () => {
  for (const status of [400, 401, 403, 404, 409, 429, 200]) {
    const { request, fixture } = await harness(response(status, { code: 123, message: 'fixture failure' }))
    await assert.rejects(request('/user/info'))
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.timers.length, 0)
    assert.equal(fixture.cleared, status === 401 ? 1 : 0)
    assert.deepEqual(fixture.redirects, status === 401 ? ['/pages/login/index'] : [])
  }
  const { request, fixture } = await harness(response(200, { code: '0', data: null }))
  await assert.rejects(request('/user/info'), /服务返回异常/)
  assert.equal(fixture.timers.length, 0)
})

test('取消请求不重试', async () => {
  for (const errMsg of ['request:fail abort', 'request:fail cancel']) {
    const { request, fixture } = await harness(options => options.fail({ errMsg }))
    await assert.rejects(request('/user/info'), { name: 'RequestCancelledError' })
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.timers.length, 0)
  }
})

test('退避期间退出登录、换账号或导航时，不再发送旧请求', async () => {
  for (const change of ['logout', 'account', 'navigation']) {
    const { request, fixture, tick } = await harness(response(503))
    const pending = request('/user/info')
    const rejected = assert.rejects(pending, { name: change === 'navigation' ? 'RequestCancelledError' : 'StaleSessionError' })
    if (change === 'navigation') fixture.revision++
    else fixture.session.token = change === 'logout' ? '' : 'another-fixture-token'
    tick()
    await rejected
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.timers.length, 0)
  }
})

test('旧会话的成功、401 和网络失败不污染新账号或继续重试', async () => {
  for (const reply of [ok, response(401), options => options.fail({ errMsg: 'request:fail timeout' })]) {
    const { request, fixture } = await harness(() => {})
    const pending = request('/user/info')
    const rejected = assert.rejects(pending, { name: 'StaleSessionError' })
    fixture.session.token = 'another-fixture-token'
    reply(fixture.calls[0])
    await rejected
    assert.equal(fixture.cleared, 0)
    assert.equal(fixture.updates, 0)
    assert.equal(fixture.timers.length, 0)
  }
})

test('公开 GET 同样重试且不携带 Token', async () => {
  const { request, fixture, tick } = await harness(response(503))
  const pending = request('/auth/wechat/mini/capabilities', 'GET', null, false)
  fixture.handle = ok
  tick()
  await pending
  assert.equal(fixture.calls.length, 2)
  assert.ok(fixture.calls.every(call => !call.header.Authorization))
})

test('二级解锁后单次重发仍生效，连续锁错误不会重复弹解锁', async () => {
  const locked = response(200, { code: 2001, data: { menuPath: '/tasks' } })
  for (const method of ['GET', 'POST']) {
    for (const afterUnlock of [ok, locked]) {
      const { request, fixture } = await harness(locked)
      fixture.unlock = async () => { fixture.handle = afterUnlock }
      const pending = request('/tasks', method)
      if (afterUnlock === ok) assert.deepEqual(await pending, { id: '9007199254740993' })
      else await assert.rejects(pending, { name: 'SecondaryLockRequiredError' })
      assert.equal(fixture.unlocks, 1)
      assert.equal(fixture.calls.length, 2)
      assert.equal(fixture.timers.length, 0)
    }
  }
})
