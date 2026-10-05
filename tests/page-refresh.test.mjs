import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { reactive, ref, nextTick, effectScope } from 'vue'
const encode = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const stateCode = (await transform(await readFile(new URL('../src/services/page-refresh-state.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code
const stateURL = encode(stateCode)
const state = await import(stateURL)
const source = (await readFile(new URL('../src/services/page-refresh.ts', import.meta.url), 'utf8')).replace(/^import .*$/gm, '')
let sequence = 0
async function fixture({ fail = false, pending = null } = {}) {
  const id = ++sequence
  const hooks = { show: [], hide: [] }
  const session = reactive({ token: 'fixture-account' })
  const loading = ref(false), error = ref(''), rows = ref([])
  const access = { paths: [], unlocked: true }
  const fixture = { session, hooks, access }
  globalThis.__pageRefreshFixtures ||= {}
  globalThis.__pageRefreshFixtures[id] = fixture
  const prefix = `import { watch, nextTick } from ${JSON.stringify(new URL('../node_modules/vue/index.mjs', import.meta.url).href)};
import { createPageFreshness, pageDataSignature } from ${JSON.stringify(stateURL)};
const {session,hooks,access}=globalThis.__pageRefreshFixtures[${id}];
const restoreSession=()=>{},uni={reLaunch:()=>{}};
const onShow=fn=>hooks.show.push(fn),onHide=fn=>hooks.hide.push(fn);
const cachedMenuAccess=()=>({menus:[],ids:[]}),getCurrentPages=()=>[{route:'pages/tasks/goals',options:access.options}];
const lockedMenuPaths=url=>{access.url=url;return access.paths},isMenuUnlocked=()=>access.unlocked;
`
  const module = await import(encode((await transform(prefix + source + `\n// fixture ${id}`, { loader: 'ts', format: 'esm' })).code))
  let calls = 0, generation = 0
  let failNext = fail
  const scope = effectScope()
  const refresh = scope.run(() => module.usePageRefresh(async () => {
    calls++; const version = ++generation, owner = session.token
    loading.value = true; error.value = ''
    if (pending) { const task = pending; pending = null; await task }
    if (version !== generation || owner !== session.token) { loading.value = false; return }
    if (failNext) { error.value = '模拟失败'; failNext = false }
    else rows.value = [owner + '-' + calls]
    loading.value = false
  }, { loading: () => loading.value, error: () => error.value, keys: () => ['fixture-goals-' + id] }))
  return {
    session, loading, error, rows, access, refresh,
    get calls() { return calls },
    async show() { hooks.show.forEach(fn => fn()); await refresh(); await nextTick(); await nextTick() },
    hide() { hooks.hide.forEach(fn => fn()); generation++ },
    write(related = true) { state.invalidatePageAfterWrite('/' + (related ? 'fixture-goals-' + id : 'other-business'), 'PUT') },
    close() { scope.stop(); delete globalThis.__pageRefreshFixtures[id] },
  }
}
test('成功加载后 60 分钟内复用，整 60 分钟及跨账号必须重新查询', () => {
  const cache = state.createPageFreshness()
  assert.equal(cache.needed('a', 'v0', 0), true)
  cache.loaded('a', 'v0', 0)
  assert.equal(cache.needed('a', 'v0', 59 * 60 * 1000), false)
  assert.equal(cache.needed('a', 'v0', 60 * 60 * 1000), true)
  assert.equal(cache.needed('b', 'v0', 1000), true)
  assert.equal(cache.needed('a', 'v1', 1000), true)
})
test('普通返回保留结果；相关写入刷新，无关写入不触发刷新', async () => {
  const f = await fixture()
  try {
    await f.show(); const rows = f.rows.value
    f.hide(); await f.show()
    assert.equal(f.calls, 1); assert.equal(f.rows.value, rows)
    f.write(false); f.hide(); await f.show(); assert.equal(f.calls, 1)
    f.write(); f.hide(); await f.show(); assert.equal(f.calls, 2)
    f.session.token = 'fixture-other-account'; await f.show()
    assert.equal(f.calls, 3); assert.match(f.rows.value[0], /^fixture-other-account/)
  } finally { f.close() }
})
test('失败不标为已加载，也不会循环自动重试；下次返回可以恢复', async () => {
  const f = await fixture({ fail: true })
  try {
    await f.show(); assert.equal(f.calls, 1); assert.equal(f.error.value, '模拟失败')
    await nextTick(); assert.equal(f.calls, 1)
    f.hide(); await f.show(); assert.equal(f.calls, 2); assert.equal(f.error.value, '')
  } finally { f.close() }
})
test('加载中离开后旧请求失效，返回等待它结束后补查，不缓存取消结果', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const f = await fixture({ pending })
  try {
    const first = f.show(); f.hide()
    const returning = f.show(); release()
    await Promise.all([first, returning]); await nextTick(); await nextTick()
    assert.equal(f.calls, 2); assert.equal(f.rows.value.length, 1)
    f.hide(); await f.show(); assert.equal(f.calls, 2)
  } finally { f.close() }
})
test('查询过程中写入不会被完成时间掩盖；解锁过期也必须重新校验', async () => {
  let release
  const f = await fixture({ pending: new Promise(resolve => { release = resolve }) })
  try {
    const first = f.show(); f.write(); release(); await first
    f.hide(); await f.show(); assert.equal(f.calls, 2)
    f.access.paths = ['/protected']; f.access.unlocked = false
    f.access.options = { kind: 'read', editId: '1' }
    f.hide(); await f.show(); assert.equal(f.calls, 3)
    assert.equal(f.access.url, '/pages/tasks/goals?kind=read&editId=1')
  } finally { f.close() }
})
