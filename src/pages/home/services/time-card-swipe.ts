import { createDaySwipe } from '../../../services/day-swipe.ts'

/** 首页时迹：左滑上一天；桌面鼠标和触控板复用相同的方向与边界。 */
export function createTimeCardSwipe(enabled, changeDate, canChange, onDrag, now = Date.now) {
  const touch = createDaySwipe(enabled, step => changeDate(-step), onDrag, step => canChange(-step))
  let mouseDown = false
  let wheelAt = -Infinity
  let wheelX = 0
  let wheelY = 0
  let wheelHandled = false
  let suppressUntil = 0
  const point = event => ({ clientX: event.clientX, clientY: event.clientY })
  function cancel() {
    mouseDown = false
    touch.cancel()
    wheelAt = -Infinity
    wheelX = wheelY = 0
    wheelHandled = false
  }
  function mouseStart(event) {
    if (event.button !== 0 || !enabled() || event.sourceCapabilities?.firesTouchEvents) return
    mouseDown = true
    touch.touchStart({ touches: [point(event)], changedTouches: [] })
  }
  function mouseMove(event) {
    if (!mouseDown) return
    if (event.buttons !== 1) { cancel(); return }
    touch.touchMove({ touches: [point(event)], changedTouches: [], preventDefault: () => event.preventDefault?.() })
  }
  function mouseEnd(event) {
    if (!mouseDown) return
    mouseDown = false
    touch.touchEnd({ touches: [], changedTouches: [point(event)] })
  }
  function wheel(event) {
    if (event.ctrlKey) return
    const stamp = now()
    // 一串带惯性的滚动只切一天；必须停下后再次横滑才能继续翻日。
    if (stamp - wheelAt > 200) { wheelX = wheelY = 0; wheelHandled = false }
    wheelAt = stamp
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
    wheelX += event.deltaX * unit
    wheelY += event.deltaY * unit
    if (Math.abs(wheelX) <= Math.abs(wheelY) * 1.5) return
    event.preventDefault?.()
    if (wheelHandled) return
    if (!enabled()) { wheelHandled = true; return }
    if (Math.abs(wheelX) < 50) return
    wheelHandled = true
    suppressUntil = stamp + 400
    // deltaX > 0 表示内容向左移动，对应上一天。
    const step = wheelX > 0 ? -1 : 1
    if (canChange(step)) changeDate(step)
  }
  return {
    ...touch, cancel, mouseStart, mouseMove, mouseEnd, wheel,
    ignoreClick: () => touch.ignoreClick() || now() < suppressUntil,
  }
}
