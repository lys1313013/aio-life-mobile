import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: ['src/pages/home/services/time-card-swipe.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createTimeCardSwipe } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
function fixture() {
  let date = 0, busy = false, now = 1000
  const changes = [], offsets = []
  const swipe = createTimeCardSwipe(() => !busy, step => { date += step; changes.push(date) }, step => date + step <= 0,
    (x, active) => offsets.push([x, active]), () => now)
  return { swipe, changes, offsets, busy: value => { busy = value }, advance: ms => { now += ms } }
}
const mouse = (x, y = 50, extra = {}) => ({ clientX: x, clientY: y, button: 0, buttons: 1, preventDefault() {}, ...extra })
function drag(swipe, dx, dy = 0) {
  swipe.mouseStart(mouse(200))
  swipe.mouseMove(mouse(200 + dx, 50 + dy))
  swipe.mouseEnd(mouse(200 + dx, 50 + dy, { buttons: 0 }))
}
const wheel = (x, y = 0, extra = {}) => ({ deltaX: x, deltaY: y, deltaMode: 0, preventDefault() {}, ...extra })

test('鼠标左拖上一天、右拖返回今天，拒绝未来及纵向/短拖', () => {
  const { swipe, changes, offsets } = fixture()
  drag(swipe, 120)
  drag(swipe, -20)
  drag(swipe, 10, 100)
  assert.deepEqual(changes, [])
  drag(swipe, -120)
  assert.deepEqual(changes, [-1])
  assert.equal(swipe.ignoreClick(), true)
  assert.ok(offsets.some(([x, active]) => x < 0 && active))
  drag(swipe, 120)
  assert.deepEqual(changes, [-1, 0])
  assert.deepEqual(offsets.at(-1), [0, false])
})

test('拖动取消、非左键、触屏合成鼠标和加载中不切换', () => {
  const f = fixture()
  f.swipe.mouseStart(mouse(200)); f.swipe.mouseMove(mouse(100)); f.swipe.cancel(); f.swipe.mouseEnd(mouse(80))
  f.swipe.mouseStart(mouse(200, 50, { button: 2 })); f.swipe.mouseMove(mouse(100)); f.swipe.mouseEnd(mouse(80))
  f.swipe.mouseStart(mouse(200, 50, { sourceCapabilities: { firesTouchEvents: true } })); f.swipe.mouseMove(mouse(100)); f.swipe.mouseEnd(mouse(80))
  f.busy(true); drag(f.swipe, -120)
  assert.deepEqual(f.changes, [])
})

test('触控板累计横移阈值，一次惯性滚动只切一天', () => {
  const f = fixture()
  f.swipe.wheel(wheel(30)); f.advance(20); f.swipe.wheel(wheel(30))
  assert.deepEqual(f.changes, [-1])
  f.advance(20); f.swipe.wheel(wheel(160))
  assert.deepEqual(f.changes, [-1])
  assert.equal(f.swipe.ignoreClick(), true)
  f.advance(250); f.swipe.wheel(wheel(-100))
  assert.deepEqual(f.changes, [-1, 0])
  f.advance(250); f.swipe.wheel(wheel(-100))
  assert.deepEqual(f.changes, [-1, 0])
})

test('纵向滚动、缩放及加载期间的惯性不切日期', () => {
  const f = fixture()
  f.swipe.wheel(wheel(5, 100)); f.swipe.wheel(wheel(100, 0, { ctrlKey: true }))
  f.advance(250); f.busy(true); f.swipe.wheel(wheel(60))
  f.advance(20); f.busy(false); f.swipe.wheel(wheel(120))
  assert.deepEqual(f.changes, [])
  f.advance(250); f.swipe.wheel(wheel(60))
  assert.deepEqual(f.changes, [-1])
})

test('触屏仍保持左滑上一天，纵向滚动不翻日', () => {
  const { swipe, changes } = fixture()
  const point = (x, y) => ({ clientX: x, clientY: y })
  swipe.touchStart({ touches: [point(200, 50)], changedTouches: [] })
  swipe.touchMove({ touches: [point(80, 50)], changedTouches: [] })
  swipe.touchEnd({ touches: [], changedTouches: [point(80, 50)] })
  assert.deepEqual(changes, [-1])
  swipe.touchStart({ touches: [point(200, 50)], changedTouches: [] })
  swipe.touchMove({ touches: [point(205, 150)], changedTouches: [] })
  swipe.touchEnd({ touches: [], changedTouches: [point(205, 150)] })
  assert.deepEqual(changes, [-1])
})
