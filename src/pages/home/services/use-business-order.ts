import { getCurrentInstance, onUnmounted, ref } from 'vue'
import spacing from '../../../styles/spacing.json'
import { businessCardRowHeight } from './business-cards.ts'

/** 首页固定目标与纪念日：短滑滚动，静止长按后拖动，释放时仅保存一次。 */
export function useBusinessOrder(options: {
  selector: string;
  rows: () => any[];
  disabled: () => boolean;
  save: (from: number, to: number) => Promise<void>;
}) {
  const instance = getCurrentInstance()
  const dragging = ref(''), target = ref(''), offset = ref(0), scrollTop = ref(0)
  let timer: ReturnType<typeof setTimeout> | null = null
  let scrolling: ReturnType<typeof setInterval> | null = null
  let startX = 0, startY = 0, lastY = 0, actualScroll = 0, startScroll = 0
  let from = -1, to = -1, revision = 0, suppressUntil = 0
  let ids: string[] = [], bounds: any = null, rowsSnapshot: any[] = []
  let frame: ReturnType<typeof setTimeout> | number | null = null
  function clearFrame() {
    if (frame === null) return
    // #ifdef WEB
    window.cancelAnimationFrame(frame as number)
    // #endif
    // #ifndef WEB
    clearTimeout(frame as ReturnType<typeof setTimeout>)
    // #endif
    frame = null
  }
  function scheduleUpdate() {
    if (frame !== null) return
    // #ifdef WEB
    frame = window.requestAnimationFrame(() => { frame = null; update() })
    // #endif
    // #ifndef WEB
    frame = setTimeout(() => { frame = null; update() }, 16)
    // #endif
  }
  function sameRows() { return ids.join(',') === options.rows().map(row => row.id).join(',') }
  function cancel() {
    revision++
    clearFrame()
    if (timer) clearTimeout(timer)
    if (scrolling) clearInterval(scrolling)
    timer = scrolling = null
    if (dragging.value) suppressUntil = Date.now() + 450
    dragging.value = target.value = ''; offset.value = 0
    // #ifdef WEB
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', finish)
    window.removeEventListener('blur', cancel)
    // #endif
  }
  function update() {
    if (!dragging.value) return
    if (options.disabled() || options.rows() !== rowsSnapshot) { cancel(); return }
    // 位移不得越过首尾行，避免 transform 撑出虚假的滚动范围。
    offset.value = Math.max(-from * businessCardRowHeight, Math.min((ids.length - 1 - from) * businessCardRowHeight, lastY - startY + actualScroll - startScroll))
    to = Math.max(0, Math.min(ids.length - 1, from + Math.round(offset.value / businessCardRowHeight)))
    target.value = ids[to]
  }
  function start(id, event) {
    cancel()
    if (options.disabled() || (event.touches && event.touches.length !== 1)) return
    const point = event.touches?.[0] || event
    if (point.clientY == null) return
    const version = revision
    startX = point.clientX; startY = lastY = point.clientY; startScroll = actualScroll
    rowsSnapshot = options.rows()
    ids = rowsSnapshot.map(row => row.id); from = to = ids.indexOf(id)
    if (from < 0 || ids.length < 2) return
    timer = setTimeout(() => {
      if (version !== revision || options.disabled() || !sameRows()) return
      uni.createSelectorQuery().in(instance?.proxy).select(options.selector).boundingClientRect().exec(result => {
        if (version !== revision || options.disabled() || !sameRows()) return
        bounds = result?.[0]
        if (!bounds) return
        scrollTop.value = actualScroll
        dragging.value = target.value = id
        uni.vibrateShort({ fail: () => {} })
        scrolling = setInterval(() => {
          const step = lastY < bounds.top + spacing.controlMin ? -spacing.inline
            : lastY > bounds.bottom - spacing.controlMin ? spacing.inline : 0
          if (options.disabled() || options.rows() !== rowsSnapshot) { cancel(); return }
          const maxScroll = Math.max(0, ids.length * businessCardRowHeight - bounds.height)
          if (step && maxScroll > 0) scrollTop.value = Math.max(0, Math.min(maxScroll, actualScroll + step))
        }, 40)
      })
    }, 300)
  }
  function move(event) {
    if (event.touches && event.touches.length !== 1) { cancel(); return }
    const point = event.touches?.[0] || event
    lastY = point.clientY
    if (!dragging.value) {
      if (Math.max(Math.abs(point.clientX - startX), Math.abs(lastY - startY)) > spacing.inline) {
        suppressUntil = Date.now() + 450
        cancel()
      }
      return
    }
    event.preventDefault?.(); event.stopPropagation?.()
    scheduleUpdate()
  }
  function finish(event) {
    if (!dragging.value) { cancel(); return }
    event?.preventDefault?.(); event?.stopPropagation?.()
    // 松手可能早于下一帧，先用最新手指位置计算最终落点。
    clearFrame()
    update()
    if (!dragging.value) return
    const valid = sameRows() && !options.disabled(), oldIndex = from, newIndex = to
    cancel()
    if (valid && oldIndex !== newIndex) void options.save(oldIndex, newIndex)
  }
  function scrolled(event) {
    actualScroll = event.detail.scrollTop
    if (!dragging.value && timer && Math.abs(actualScroll - startScroll) > spacing.inline) cancel()
    if (dragging.value) scheduleUpdate()
  }
  function mouseStart(id, event) {
    // #ifdef WEB
    if (event.button !== 0) return
    start(id, event)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', finish)
    window.addEventListener('blur', cancel)
    // #endif
  }
  function clickBlocked() { return !!dragging.value || Date.now() < suppressUntil }
  function style(id) {
    let displacement = 0
    if (dragging.value === id) displacement = offset.value
    else if (dragging.value) {
      const index = ids.indexOf(id), destination = ids.indexOf(target.value)
      if (index > from && index <= destination) displacement = -businessCardRowHeight
      else if (index < from && index >= destination) displacement = businessCardRowHeight
    }
    // 显式清零，原生端样式合并也不能残留上一次拖动的 transform。
    return { height: businessCardRowHeight + 'px', transform: 'translateY(' + displacement + 'px)', zIndex: dragging.value === id ? 2 : 0 }
  }
  function scrollEnabled() {
    // H5 关闭 scroll-y 后会忽略 scroll-top；默认滚动由拖动事件阻止。
    // #ifdef WEB
    return true
    // #endif
    // #ifndef WEB
    return !dragging.value
    // #endif
  }
  function classes(id) {
    return { 'business-sort-active': !!dragging.value, 'business-dragging': dragging.value === id, 'business-drop-before': !!dragging.value && target.value === id && to < from, 'business-drop-after': !!dragging.value && target.value === id && to > from }
  }
  function keyboard(id, direction) {
    if (options.disabled()) return
    const index = options.rows().findIndex(row => row.id === id)
    if (index >= 0 && options.rows()[index + direction]) void options.save(index, index + direction)
  }
  onUnmounted(cancel)
  return { dragging, scrollTop, scrollEnabled, start, mouseStart, move, finish, cancel, scrolled, clickBlocked, style, classes, keyboard }
}
