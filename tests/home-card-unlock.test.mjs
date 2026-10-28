import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'esbuild'

const source = await readFile(new URL('../src/pages/home/services/card-unlock.ts', import.meta.url), 'utf8')
const code = transformSync(source.replace(/^import .*\n/gm, '').replace('export async function', 'async function'), { loader: 'ts' }).code
function setup(check) {
  const session = { token: 'fixture' }, toasts = []
  let revision = 0, active = true, refreshes = 0
  const unlock = new Function('checkMenuAccess', 'session', 'unlockNavigationRevision', 'uni', code + '\nreturn unlockHomeCard')(
    check, session, () => revision, { showToast: message => toasts.push(message) },
  )
  return { session, toasts, unlock: (routes = ['/home', '/business']) => unlock(routes, async () => { refreshes++ }, () => active),
    leave: () => { active = false }, navigate: () => { revision++ }, refreshes: () => refreshes }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('全部依赖菜单验证结束后才刷新，连续点击不重复验证或导航', async () => {
  const gate = deferred(), paths = []
  const f = setup(async path => { paths.push(path); await gate.promise })
  const first = f.unlock(['/home', '/business', '/business'])
  await f.unlock()
  assert.deepEqual(paths, ['/home'])
  assert.equal(f.refreshes(), 0)
  gate.resolve()
  await first
  assert.deepEqual(paths, ['/home', '/business'])
  assert.equal(f.refreshes(), 1)
  assert.deepEqual(f.toasts, [])
})

for (const reason of ['已取消解锁', '菜单锁检查失败']) test(`${reason}不刷新，后续可重试`, async () => {
  let fail = true
  const f = setup(async () => { if (fail) throw Error(reason) })
  await f.unlock()
  assert.equal(f.refreshes(), 0)
  assert.equal(f.toasts.length, reason === '已取消解锁' ? 0 : 1)
  fail = false
  await f.unlock()
  assert.equal(f.refreshes(), 1)
})

for (const change of ['leave', 'navigate', 'session']) test(`${change}变化后不继续解锁或刷新旧卡片`, async () => {
  const gate = deferred(), paths = []
  const f = setup(async path => { paths.push(path); await gate.promise })
  const pending = f.unlock()
  if (change === 'session') f.session.token = 'another-fixture'
  else f[change]()
  gate.resolve()
  await pending
  assert.deepEqual(paths, ['/home'])
  assert.equal(f.refreshes(), 0)
  assert.deepEqual(f.toasts, [])
})
