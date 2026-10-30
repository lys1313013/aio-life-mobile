/** 触控板横向惯性滚动每轮只驱动一次 swiper 翻日。触屏和鼠标由 swiper 原生处理。 */
export function createTimeCardWheel(enabled, changeDate, canChange, now = Date.now) {
  let wheelAt = -Infinity
  let wheelX = 0
  let wheelY = 0
  let wheelHandled = false
  let suppressUntil = 0
  function cancel() {
    wheelAt = -Infinity
    wheelX = wheelY = 0
    wheelHandled = false
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
    // deltaX > 0 表示内容向左移动，对应后一天。
    const step = wheelX > 0 ? 1 : -1
    if (canChange(step)) changeDate(step)
  }
  return { cancel, wheel, ignoreClick: () => now() < suppressUntil }
}
