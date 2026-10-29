import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'esbuild'
import { effectScope, nextTick, reactive, ref, watch } from 'vue'

async function sourceFunction(path, name, dependencies) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const code = transformSync(source, { loader: 'ts', format: 'esm' }).code
  return new Function(...Object.keys(dependencies), code + `\nreturn ${name};`)(...Object.values(dependencies))
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function fixture(t) {
  const hooks = { show: [], hide: [], unmount: [] }, session = reactive({ token: 'fixture-owner' })
  const createRecordScope = await sourceFunction('../src/services/records/page-scope.ts', 'createRecordScope', {
    session, currentPageAccess: () => ({ expired: false }),
    onShow: fn => hooks.show.push(fn), onHide: fn => hooks.hide.push(fn), onUnmounted: fn => hooks.unmount.push(fn),
  })
  const cleared = [], scope = createRecordScope(clear => cleared.push(clear))
  t.after(() => hooks.unmount.forEach(fn => fn()))
  return { scope, hooks, session, cleared, show: () => hooks.show.forEach(fn => fn()), hide: () => hooks.hide.forEach(fn => fn()) }
}

test('离页立即结束等待，慢请求未完成也可以开始新查询', async t => {
  const f = await fixture(t), old = deferred()
  const rejected = assert.rejects(f.scope.wait(old.promise), error => error.name === 'PageInactiveError')
  f.hide()
  await rejected
  f.show()
  assert.equal(await f.scope.wait(Promise.resolve('新页面数据')), '新页面数据')
  old.reject(new Error('晚到的网络失败'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.cleared, [false])
})

test('卸载及失效后发起的等待均立即拒绝，并接住原请求的晚到失败', async t => {
  const f = await fixture(t), old = deferred(), inactive = deferred()
  const oldRejected = assert.rejects(f.scope.wait(old.promise), error => error.name === 'PageInactiveError')
  f.hooks.unmount.forEach(fn => fn())
  await oldRejected
  await assert.rejects(f.scope.wait(inactive.promise), error => error.name === 'PageInactiveError')
  old.resolve('卸载前数据')
  inactive.reject(new Error('失效请求失败'))
  await new Promise(resolve => setImmediate(resolve))
})

for (const lateFailure of [false, true]) test(`同一轮离开返回立即补查，旧请求${lateFailure ? '失败' : '成功'}不清掉新 loading 或覆盖结果`, async t => {
  const f = await fixture(t)
  const state = await sourceFunction('../src/services/page-refresh-state.ts', '({ createPageFreshness, pageDataSignature })', {})
  const usePageRefresh = await sourceFunction('../src/services/page-refresh.ts', 'usePageRefresh', {
    ...state, session: f.session, watch, nextTick,
    restoreSession: () => {}, uni: { reLaunch: () => {} },
    cachedMenuAccess: () => ({ menus: [], ids: [] }), getCurrentPages: () => [{ route: 'pages/tasks/goals', options: {} }],
    lockedMenuPaths: () => [], isMenuUnlocked: () => true,
    onShow: fn => f.hooks.show.push(fn), onHide: fn => f.hooks.hide.push(fn),
  })
  // 执行目标页真实 load 函数，包含它的 generation / finally 防护。
  const pageSource = await readFile(new URL('../src/pages/tasks/goals.uvue', import.meta.url), 'utf8')
  const loadSource = pageSource.slice(pageSource.indexOf('async function load('), pageSource.indexOf('const refreshOnShow ='))
  const loading = ref(false), refreshing = ref(false), error = ref(''), goals = ref([]), old = deferred(), fresh = deferred()
  let calls = 0
  const load = new Function('scope', 'fetchGoals', 'loading', 'refreshing', 'error', 'goals',
    `let generation = 0, alive = true, pendingEditId = ''; const goalTypes = [], statusLabels = [], statuses = [], typeFilter = { value: '' }, statusFilter = { value: '' }, keyword = { value: '' };\n${loadSource}\nreturn load;`)(
      f.scope, () => (++calls === 1 ? old.promise : fresh.promise), loading, refreshing, error, goals)
  const effects = effectScope()
  t.after(() => effects.stop())
  const refresh = effects.run(() => usePageRefresh(load, { loading: () => loading.value, error: () => error.value, keys: () => ['goals'] }))
  const first = refresh()
  f.hide(); f.show(); refresh()
  await first; await nextTick(); await nextTick()
  assert.equal(calls, 2)
  assert.equal(loading.value, true)
  if (lateFailure) old.reject(new Error('旧请求失败'))
  else old.resolve([{ id: 'old' }])
  await nextTick(); await nextTick()
  assert.equal(loading.value, true)
  assert.equal(error.value, '')
  assert.deepEqual(goals.value, [])
  fresh.resolve([{ id: 'fresh' }])
  await nextTick(); await nextTick(); await nextTick()
  assert.equal(loading.value, false)
  assert.deepEqual(goals.value, [{ id: 'fresh' }])
  f.hide(); f.show(); await refresh()
  assert.equal(calls, 2)
})
