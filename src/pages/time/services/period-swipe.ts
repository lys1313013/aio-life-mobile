type Point = { clientX: number; clientY: number }
type Gesture = { touches: ArrayLike<Point>; changedTouches: ArrayLike<Point>; preventDefault?: () => void }

/** 周期页完整跟手；月内滚动的归属在按下时确定，不能在同一手势中翻月。 */
export function createPeriodSwipe(options: {
  enabled: () => boolean
  width: () => number
  canChange: (step: number) => boolean
  drag: (offset: number) => void
  settle: (step: number) => void
}) {
  let start: Point | null = null
  let direction = ''
  let previous = false, next = false
  let suppressUntil = 0
  function cancel() {
    if (direction) suppressUntil = Date.now() + 400
    start = null
    direction = ''
  }
  function touchStart(event: Gesture) {
    cancel()
    if (!options.enabled() || event.touches.length !== 1) return
    // 原生 Touch 的坐标可能在原型上，不能依赖对象展开复制。
    start = { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY }
    previous = options.canChange(-1)
    next = options.canChange(1)
    suppressUntil = 0
  }
  function touchMove(event: Gesture) {
    if (!start) return
    if (!options.enabled() || event.touches.length !== 1) { touchCancel(); return }
    const dx = event.touches[0].clientX - start.clientX
    const dy = event.touches[0].clientY - start.clientY
    if (!direction && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      direction = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'horizontal' : 'vertical'
      if (direction === 'horizontal' && !(dx < 0 ? next : previous)) direction = 'scroll'
    }
    if (direction) suppressUntil = Date.now() + 400
    if (direction !== 'horizontal') return
    event.preventDefault?.()
    const allowed = dx < 0 ? next : previous
    options.drag(allowed ? Math.max(-options.width(), Math.min(options.width(), dx)) : dx * 0.15)
  }
  function touchEnd(event: Gesture) {
    if (!start) return
    const dx = (event.changedTouches[0]?.clientX ?? start.clientX) - start.clientX
    const dy = (event.changedTouches[0]?.clientY ?? start.clientY) - start.clientY
    const horizontal = direction === 'horizontal'
    const commit = options.enabled() && event.touches.length === 0 && event.changedTouches.length === 1 && horizontal
      && (dx < 0 ? next : previous) && Math.abs(dx) >= Math.min(80, options.width() * 0.2) && Math.abs(dx) > Math.abs(dy) * 1.5
    cancel()
    if (horizontal) options.settle(commit ? (dx < 0 ? 1 : -1) : 0)
  }
  function touchCancel() { const moved = direction === 'horizontal'; cancel(); if (moved) options.settle(0) }
  return { touchStart, touchMove, touchEnd, touchCancel, cancel, ignoreClick: () => Date.now() < suppressUntil }
}
