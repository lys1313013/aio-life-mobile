import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'esbuild'
import { effectScope, nextTick, reactive, readonly, ref, watch } from 'vue'

const source = (await readFile(new URL('../src/services/domains/page-session.ts', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/^export /gm, '')
const code = transformSync(source, { loader: 'ts', format: 'esm' }).code
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(t, cached = false) {
  const hooks = { show: [], hide: [], unload: [], unmount: [] }, provided = {}, calls = [], users = [], access = { expired: false }
  const session = reactive({ token: 'fixture-a', user: cached ? { id: 'fixture-a' } : null })
  const dependencies = {
    ref, readonly, watch, session, provide: (key, value) => { provided[key] = value },
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnload: fn => hooks.unload.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
    restoreSession: () => {}, currentPageAccess: () => access, uni: { reLaunch: () => calls.push('login') },
    usePageRefresh: load => load,
    fetchUser: () => {
      const request = deferred(), token = session.token
      users.push(request)
      return request.promise.then(user => { if (token === session.token) session.user = user; return user })
    },
  }
  const useDomainPage = new Function(...Object.keys(dependencies), code + '\nreturn useDomainPage;')(...Object.values(dependencies))
  const effects = effectScope()
  const state = effects.run(() => useDomainPage(refresh => calls.push(['resume', refresh, session.user?.id]), clear => calls.push(['suspend', clear])))
  t.after(() => { hooks.unmount.forEach(fn => fn()); effects.stop() })
  return { ...state, provided, session, users, calls, access, show: () => hooks.show.forEach(fn => fn()), hide: () => hooks.hide.forEach(fn => fn()) }
}
async function flush() { await nextTick(); await nextTick(); await nextTick() }

test('冷启动等待用户资料时提供 initializing，占位状态交接到业务请求', async t => {
  const f = fixture(t)
  f.show()
  assert.equal(f.initializing.value, true)
  assert.equal(f.provided['domain-page-initializing'].value, true)
  assert.deepEqual(f.calls, [])
  f.users[0].resolve({ id: 'fixture-a' })
  await flush()
  assert.equal(f.initializing.value, false)
  assert.deepEqual(f.calls, [['resume', false, 'fixture-a'], ['resume', true, 'fixture-a']])
})

test('已有用户资料返回无需初始化占位，继续交给原有缓存决策', t => {
  const f = fixture(t, true)
  f.show()
  assert.equal(f.initializing.value, false)
  assert.equal(f.users.length, 0)
  assert.deepEqual(f.calls, [['resume', false, 'fixture-a'], ['resume', true, 'fixture-a']])
})

test('初始化中离页返回，旧资料请求完成不能结束新初始化或启动隐藏页面查询', async t => {
  const f = fixture(t)
  f.show(); f.hide(); f.show()
  assert.equal(f.users.length, 2)
  f.users[0].resolve({ id: 'fixture-a' })
  await flush()
  assert.equal(f.initializing.value, true)
  assert.deepEqual(f.calls, [['suspend', false]])
  f.users[1].resolve({ id: 'fixture-a' })
  await flush()
  assert.equal(f.initializing.value, false)
  assert.deepEqual(f.calls.slice(1), [['resume', false, 'fixture-a'], ['resume', true, 'fixture-a']])
})

test('切换账号先等待新资料，不把旧账号角色带进业务恢复', async t => {
  const f = fixture(t, true)
  f.show(); f.calls.length = 0
  // 模拟 saveToken 的同步顺序：先更新 token，再清空 user。
  f.session.token = 'fixture-b'
  f.session.user = null
  assert.equal(f.initializing.value, true)
  assert.equal(f.provided['domain-page-revision'].value, 1)
  assert.deepEqual(f.calls, [['suspend', true]])
  f.users[0].resolve({ id: 'fixture-b' })
  await flush()
  assert.deepEqual(f.calls.slice(1), [['resume', false, 'fixture-b'], ['resume', true, 'fixture-b']])
  assert.equal(f.initializing.value, false)
})

test('普通返回保留数据域；权限过期或账号清理同步更新数据域', async t => {
  const f = fixture(t, true), revision = f.provided['domain-page-revision']
  f.show(); f.hide(); f.show()
  assert.equal(revision.value, 0)
  f.hide(); f.access.expired = true; f.show()
  assert.equal(revision.value, 1)
  assert.deepEqual(f.calls.at(-3), ['suspend', true])
  f.access.expired = false
  f.session.token = ''
  assert.equal(revision.value, 2)
})

test('资料加载失败仍交给业务查询错误反馈；离页后失败只清理初始化状态', async t => {
  const f = fixture(t)
  f.show(); f.users[0].reject(new Error('模拟资料失败')); await flush()
  assert.equal(f.initializing.value, false)
  assert.deepEqual(f.calls, [['resume', false, undefined], ['resume', true, undefined]])
  f.hide(); f.calls.length = 0; f.show(); f.hide()
  f.users[1].reject(new Error('模拟离页失败')); await flush()
  assert.equal(f.initializing.value, false)
  assert.deepEqual(f.calls, [['suspend', false]])
})
