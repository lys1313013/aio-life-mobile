import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive, watch } from 'vue'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/services/menu-visuals.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'cjs' })
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(name => {
  if (name === 'vue') return { reactive, watch }
  if (name === './session.ts') return { session: reactive({ token: 'test' }) }
  throw Error(name)
}, module, module.exports)
const { createMenuVisuals } = module.exports
const reading = { menuId: '9007199254740993', icon: 'lucide:book-open', iconColor: '#123456' }
const data = { menus: [reading], cards: { 'section.reading': reading } }
const state = () => reactive({ menus: [], cards: {}, ready: false, loading: false, error: '' })
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }

test('卡片和菜单共享图标颜色，配置变更及颜色清空后同步更新', async () => {
  const s = state(), c = createMenuVisuals(s, () => 'A')
  let value = data, calls = 0
  const fetch = async path => { assert.equal(path, '/menu/visuals?client=mobile'); calls++; return value }
  await Promise.all([c.load(fetch), c.load(fetch)])
  assert.equal(calls, 1)
  assert.deepEqual(c.visual('section.reading'), c.menuVisual(reading.menuId))
  const changed = { ...reading, icon: 'lucide:library', iconColor: '#abcdef' }
  value = { menus: [changed], cards: { 'section.reading': changed } }
  c.afterWrite('/menu/admin/7', 'PUT')
  await c.load(fetch)
  assert.deepEqual(c.visual('section.reading'), { icon: 'lucide:library', iconColor: '#abcdef' })
  changed.iconColor = ''
  await c.load(fetch, true)
  assert.equal(c.visual('section.reading').iconColor, undefined)
})

test('刷新失败保留配置，旧响应不覆盖新配置，切换账号清空缓存', async () => {
  const s = state(); let owner = 'A'
  const c = createMenuVisuals(s, () => owner)
  await c.load(async () => data)
  await c.load(async () => { throw Error('network') }, true)
  assert.equal(c.visual('section.reading').iconColor, '#123456')
  assert.equal(s.error, 'network')
  const gate = deferred()
  const old = c.load(() => gate.promise, true)
  await c.load(async () => ({ menus: [], cards: {} }), true)
  gate.resolve(data); await old
  assert.equal(c.visual('section.reading').icon, 'lucide:layout-dashboard')
  const next = deferred(), pending = c.load(() => next.promise, true)
  owner = 'B'; c.clear(); next.resolve(data); await pending
  assert.equal(s.ready, false)
  assert.deepEqual(s.menus, [])
})
