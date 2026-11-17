import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function loadModule(path) {
  const { outputFiles } = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
}
const { createPeriodSwipe } = await loadModule('src/pages/time/services/period-swipe.ts')
const { createPeriodCache } = await loadModule('src/pages/time/services/period-cache.ts')
const { initialTimeViewportHeight } = await loadModule('src/pages/time/services/viewport-layout.ts')

test('微信首次时间轴按导航换行、胶囊和安全区占满正文，不从 44px 起跳', () => {
  for (const [windowInfo, capsule, expected] of [
    [{ windowWidth: 412, windowHeight: 923, statusBarHeight: 20 },
      { top: 26, height: 32, width: 87, left: 318, right: 405 }, 761],
    [{ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeAreaInsets: { bottom: 34 } },
      { top: 53, height: 32, width: 87, left: 296, right: 383 }, 621],
    [{ windowWidth: 768, windowHeight: 1024, statusBarHeight: 24, safeAreaInsets: { bottom: 20 } },
      { top: 32, height: 32, width: 87, left: 660, right: 747 }, 878],
    [{ windowWidth: 1440, windowHeight: 900, statusBarHeight: 0 },
      { top: 6, height: 32, width: 87, left: 1346, right: 1433 }, 802],
  ]) assert.equal(initialTimeViewportHeight(windowInfo, capsule), expected)
})

test('胶囊尚未返回时仍预留导航，极矮窗口保留可用时间轴', () => {
  assert.equal(initialTimeViewportHeight({ windowWidth: 390, windowHeight: 844, statusBarHeight: 20 }, {}), 678)
  assert.equal(initialTimeViewportHeight({ windowWidth: 320, windowHeight: 120, statusBarHeight: 20 }, {}), 88)
})
const gesture = (x, y = 0, end = false) => ({ touches: end ? [] : [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })
function swipeFixture() {
  const offsets = [], changes = []
  let enabled = true, next = true
  const swipe = createPeriodSwipe({ enabled: () => enabled, width: () => 360, canChange: step => step < 0 || next,
    drag: offset => offsets.push(offset), settle: step => changes.push(step) })
  return { swipe, offsets, changes, enable: value => { enabled = value }, allowNext: value => { next = value } }
}

test('整页一比一跟手，松手才进入目标周期的落位动画', () => {
  const f = swipeFixture()
  f.swipe.touchStart(gesture(300))
  f.swipe.touchMove(gesture(100))
  assert.equal(f.offsets.at(-1), -200)
  assert.deepEqual(f.changes, [])
  f.swipe.touchEnd(gesture(100, 0, true))
  assert.deepEqual(f.changes, [1])
  assert.equal(f.swipe.ignoreClick(), true)
})

test('短拖与取消回原位，纵滑不会翻周期', () => {
  const f = swipeFixture()
  f.swipe.touchStart(gesture(200))
  f.swipe.touchMove(gesture(170))
  f.swipe.touchEnd(gesture(170, 0, true))
  assert.deepEqual(f.changes, [0])
  f.swipe.touchStart(gesture(200))
  f.swipe.touchMove(gesture(50))
  f.swipe.touchCancel()
  assert.deepEqual(f.changes, [0, 0])
  f.swipe.touchStart(gesture(200))
  f.swipe.touchMove(gesture(195, 100))
  f.swipe.touchEnd(gesture(100, 120, true))
  assert.deepEqual(f.changes, [0, 0])
  assert.equal(f.swipe.ignoreClick(), true)
})

test('月内滚动到边缘后必须重新起手，禁用期间不提交翻页', () => {
  const f = swipeFixture()
  f.allowNext(false)
  f.swipe.touchStart(gesture(300))
  f.allowNext(true)
  f.swipe.touchMove(gesture(100))
  f.swipe.touchEnd(gesture(100, 0, true))
  assert.deepEqual(f.offsets, [])
  assert.deepEqual(f.changes, [])
  f.swipe.touchStart(gesture(300))
  f.swipe.touchMove(gesture(100))
  f.enable(false)
  f.swipe.touchEnd(gesture(100, 0, true))
  assert.deepEqual(f.changes, [0])
})

test('相邻周期预取与进入该周期复用同一请求，空列表也是有效缓存', async () => {
  let release, calls = 0
  const cache = createPeriodCache(() => { calls++; return new Promise(resolve => { release = resolve }) })
  const preview = cache.get('2026-02-28', 'month')
  const current = cache.get('2026-02-01', 'month')
  assert.equal(preview, current)
  release([])
  await current
  assert.deepEqual(await cache.get('2026-02-15', 'month'), [])
  assert.equal(calls, 1)
})

test('刷新或账号切换后的旧预取不能写回缓存或清除新请求', async () => {
  const releases = []
  const cache = createPeriodCache(() => new Promise(resolve => releases.push(resolve)))
  const stale = cache.get('2026-12-31', 'day')
  cache.clear()
  const fresh = cache.get('2026-12-31', 'day')
  releases[0]([{ id: 'old' }])
  await stale
  assert.equal(cache.read('2026-12-31', 'day'), undefined)
  assert.equal(cache.get('2026-12-31', 'day'), fresh)
  releases[1]([{ id: '9223372036854775807' }])
  await fresh
  assert.equal(cache.read('2026-12-31', 'day')[0].id, '9223372036854775807')
})

test('预取失败不当作空数据，进入周期后仍可重新请求', async () => {
  let calls = 0
  const cache = createPeriodCache(async () => { if (++calls === 1) throw new Error('fixture failure'); return [] })
  await assert.rejects(cache.get('2027-01-01', 'day'), /fixture failure/)
  assert.equal(cache.read('2027-01-01', 'day'), undefined)
  assert.deepEqual(await cache.get('2027-01-01', 'day'), [])
})
