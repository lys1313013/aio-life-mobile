import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { reactive, watch } from 'vue'

const source = await readFile(new URL('../src/services/menu-access-cache.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'cjs' })
const tree = [{ path: '/my-hub/memo', meta: { menuId: '9223372036854775807' } }]
function setup() {
  const session = reactive({ token: 'account-a' })
  let now = 1000
  let cleared = 0
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', code)(
    (name) => {
      if (name === 'vue') return { watch }
      if (name === './session.ts') return { session }
      if (name === './life-catalog-cache.ts') return { clearLifeCatalogCache: () => { cleared++ } }
      throw Error(name)
    }, module, module.exports, { now: () => now },
  )
  const calls = []
  const fetch = async (path) => { calls.push(path); return path === '/menu/all?client=mobile' ? tree : ['9223372036854775807'] }
  return { ...module.exports, session, calls, fetch, cleared: () => cleared, advance: (ms) => { now += ms } }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('锁配置和菜单树复用，12小时到期后刷新', async () => {
  const c = setup()
  const first = await c.loadMenuAccess(c.fetch)
  assert.deepEqual(first, { ids: ['9223372036854775807'], menus: tree })
  c.advance(12 * 60 * 60 * 1000 - 1)
  assert.equal(c.cachedMenuAccess(), first)
  assert.equal(await c.loadMenuAccess(c.fetch), first)
  assert.equal(c.calls.length, 2)
  c.advance(1)
  assert.equal(c.cachedMenuAccess(), null)
  await c.loadMenuAccess(c.fetch)
  assert.equal(c.calls.length, 4)
})

test('空锁列表也缓存，不请求菜单树', async () => {
  const c = setup()
  let count = 0
  const fetch = async (path) => { assert.equal(path, '/auth/secondary-lock/menus'); count++; return [] }
  assert.deepEqual(await c.loadMenuAccess(fetch), { ids: [], menus: [] })
  await c.loadMenuAccess(fetch)
  assert.equal(count, 1)
})

test('并发检查合并，失败不缓存且可重试', async () => {
  const c = setup(), gate = deferred()
  let count = 0
  const fetch = () => { count++; return gate.promise }
  const first = c.loadMenuAccess(fetch), second = c.loadMenuAccess(fetch)
  assert.equal(first, second)
  assert.equal(count, 1)
  gate.reject(Error('网络失败'))
  await assert.rejects(first, /网络失败/)
  assert.equal(c.cachedMenuAccess(), null)
  await c.loadMenuAccess(c.fetch)
  assert.equal(c.calls.length, 2)
})

test('切换账号清缓存，迟到的旧请求不能覆盖或清除新请求', async () => {
  const c = setup(), oldGate = deferred(), newGate = deferred()
  const old = c.loadMenuAccess(() => oldGate.promise)
  const oldError = assert.rejects(old, /配置已变化/)
  c.session.token = 'account-b'
  const current = c.loadMenuAccess(() => newGate.promise)
  oldGate.resolve([])
  await oldError
  assert.equal(c.cachedMenuAccess(), null)
  assert.equal(c.loadMenuAccess(c.fetch), current)
  newGate.resolve([])
  await current
  c.session.token = ''
  assert.equal(c.cachedMenuAccess(), null)
  c.session.token = 'account-a'
  await c.loadMenuAccess(c.fetch)
  assert.equal(c.calls.length, 2)
})

test('修改配置时废弃在途结果；新检查重新请求', async () => {
  const c = setup(), gate = deferred()
  const pending = c.loadMenuAccess(() => gate.promise)
  const rejected = assert.rejects(pending, /配置已变化/)
  c.invalidateMenuAccessAfterWrite('/auth/secondary-lock/menus', 'PUT')
  gate.resolve([])
  await rejected
  assert.equal(c.cachedMenuAccess(), null)
  await c.loadMenuAccess(c.fetch)
  assert.equal(c.calls.length, 2)
})

test('菜单锁、密码和菜单管理写入失效，读取和普通业务写入不失效', async () => {
  const c = setup()
  await c.loadMenuAccess(c.fetch)
  c.invalidateMenuAccessAfterWrite('/auth/secondary-lock/menus', 'GET')
  c.invalidateMenuAccessAfterWrite('/memo', 'POST')
  assert.notEqual(c.cachedMenuAccess(), null)
  for (const path of ['/auth/secondary-lock/menus', '/auth/secondary-password', '/auth/reset-secondary-password', '/menu/admin', '/menu/admin/1/status']) {
    c.invalidateMenuAccessAfterWrite(path, 'PUT')
    assert.equal(c.cachedMenuAccess(), null)
    await c.loadMenuAccess(c.fetch)
  }
})

test('异常ID、菜单树及菜单树请求失败均不缓存', async () => {
  const c = setup()
  await assert.rejects(c.loadMenuAccess(async () => [123]), /数据异常/)
  assert.equal(c.cachedMenuAccess(), null)
  for (const invalid of [null, [null], [{ children: {} }]]) {
    await assert.rejects(c.loadMenuAccess(async (path) => path === '/menu/all?client=mobile' ? invalid : ['1']), /数据异常/)
    assert.equal(c.cachedMenuAccess(), null)
  }
  await assert.rejects(c.loadMenuAccess(async (path) => {
    if (path === '/menu/all?client=mobile') throw Error('菜单树失败')
    return ['1']
  }), /菜单树失败/)
  assert.equal(c.cachedMenuAccess(), null)
  await c.loadMenuAccess(c.fetch)
})


test('管理端切换任一端状态和个人菜单写入使目录失效，读取不清缓存', () => {
  const c = setup()
  c.invalidateMenuAccessAfterWrite('/menu/admin/7/mobile-status', 'PUT')
  c.invalidateMenuAccessAfterWrite('/menu/admin/7/status', 'PUT')
  c.invalidateMenuAccessAfterWrite('/menu/preferences?client=mobile', 'PUT')
  c.invalidateMenuAccessAfterWrite('/menu/preferences?client=mobile', 'GET')
  assert.equal(c.cleared(), 3)
})
