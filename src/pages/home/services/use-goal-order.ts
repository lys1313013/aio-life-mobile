import { getCurrentInstance, onUnmounted, ref } from 'vue'
import spacing from '../../../styles/spacing.json'
import { businessCardRowHeight } from './business-cards.ts'

/** 首页固定目标：短滑滚动，静止长按后拖动，释放时仅保存一次。 */
export function useGoalOrder(options: {
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
  let ids: string[] = [], bounds: any = null
  function sameRows() { return ids.join(',') === options.rows().map(row => row.id).join(',') }
  function cancel() {
    revision++
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
    if (options.disabled() || !sameRows()) { cancel(); return }
    offset.value = lastY - startY + actualScroll - startScroll
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
    ids = options.rows().map(row => row.id); from = to = ids.indexOf(id)
    if (from < 0 || ids.length < 2) return
    timer = setTimeout(() => {
      if (version !== revision || options.disabled() || !sameRows()) return
      uni.createSelectorQuery().in(instance?.proxy).select('.goal-scroll').boundingClientRect().exec(result => {
        if (version !== revision || options.disabled() || !sameRows()) return
        bounds = result?.[0]
        if (!bounds) return
        dragging.value = target.value = id
        uni.vibrateShort({ fail: () => {} })
        scrolling = setInterval(() => {
          const step = lastY < bounds.top + spacing.controlMin ? -spacing.inline
            : lastY > bounds.bottom - spacing.controlMin ? spacing.inline : 0
          if (step) scrollTop.value = Math.max(0, Math.min(ids.length * businessCardRowHeight - bounds.height, actualScroll + step))
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
    update()
  }
  function finish(event) {
    if (!dragging.value) { cancel(); return }
    event?.preventDefault?.(); event?.stopPropagation?.()
    const valid = sameRows() && !options.disabled(), oldIndex = from, newIndex = to
    cancel()
    if (valid && oldIndex !== newIndex) void options.save(oldIndex, newIndex)
  }
  function scrolled(event) {
    actualScroll = event.detail.scrollTop
    scrollTop.value = actualScroll
    if (!dragging.value && timer && Math.abs(actualScroll - startScroll) > spacing.inline) cancel()
    update()
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
  function style(id) { return dragging.value === id ? { transform: 'translateY(' + offset.value + 'px)', zIndex: 2 } : {} }
  function classes(id) {
    return { 'goal-dragging': dragging.value === id, 'goal-drop-before': !!dragging.value && target.value === id && to < from, 'goal-drop-after': !!dragging.value && target.value === id && to > from }
  }
  function keyboard(id, direction) {
    if (options.disabled()) return
    const index = options.rows().findIndex(row => row.id === id)
    if (index >= 0 && options.rows()[index + direction]) void options.save(index, index + direction)
  }
  onUnmounted(cancel)
  return { dragging, scrollTop, start, mouseStart, move, finish, cancel, scrolled, clickBlocked, style, classes, keyboard }
}
