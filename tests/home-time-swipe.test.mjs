import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: ['src/pages/home/services/time-card-swipe.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createTimeCardWheel } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
function fixture() {
  let date = 0, busy = false, now = 1000
  const changes = []
  const swipe = createTimeCardWheel(() => !busy, step => { date += step; changes.push(date) }, step => date + step <= 0, () => now)
  return { swipe, changes, busy: value => { busy = value }, advance: ms => { now += ms } }
}
const wheel = (x, y = 0, extra = {}) => ({ deltaX: x, deltaY: y, deltaMode: 0, preventDefault() {}, ...extra })

test('触控板累计横移阈值，一次惯性滚动只切一天', () => {
  const f = fixture()
  f.swipe.wheel(wheel(-30)); f.advance(20); f.swipe.wheel(wheel(-30))
  assert.deepEqual(f.changes, [-1])
  f.advance(20); f.swipe.wheel(wheel(-160))
  assert.deepEqual(f.changes, [-1])
  assert.equal(f.swipe.ignoreClick(), true)
  f.advance(250); f.swipe.wheel(wheel(100))
  assert.deepEqual(f.changes, [-1, 0])
  f.advance(250); f.swipe.wheel(wheel(100))
  assert.deepEqual(f.changes, [-1, 0])
})

test('纵向滚动、缩放及加载期间的惯性不切日期', () => {
  const f = fixture()
  f.swipe.wheel(wheel(-5, 100)); f.swipe.wheel(wheel(-100, 0, { ctrlKey: true }))
  f.advance(250); f.busy(true); f.swipe.wheel(wheel(-60))
  f.advance(20); f.busy(false); f.swipe.wheel(wheel(-120))
  assert.deepEqual(f.changes, [])
  f.advance(250); f.swipe.wheel(wheel(-60))
  assert.deepEqual(f.changes, [-1])
})

test('取消后清除惯性累计，下一轮手势仍按阈值切换', () => {
  const f = fixture()
  f.swipe.wheel(wheel(-30))
  f.swipe.cancel()
  f.swipe.wheel(wheel(-30))
  assert.deepEqual(f.changes, [])
  f.swipe.wheel(wheel(-30))
  assert.deepEqual(f.changes, [-1])
})
