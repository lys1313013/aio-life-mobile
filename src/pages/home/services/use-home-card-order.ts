import { getCurrentInstance, onUnmounted, ref } from 'vue'
import spacing from '../../../styles/spacing.json'
import { cardDropIndex, projectCardLayout } from './home-card-order.ts'

export function useHomeCardOrder(options: {
  rows: (group: string) => any[];
  disabled: () => boolean;
  signature: () => string;
  save: (group: string, visibleKeys: string[]) => Promise<void>;
}) {
  const instance = getCurrentInstance()
  const dragging = ref(''), target = ref(''), group = ref('')
  const previewKeys = ref<string[]>([])
  const offsetX = ref(0), offsetY = ref(0), scrollTop = ref(0)
  let rects: any[] = [], viewport: any = null, maxScroll = 0, contentHeight = 0
  let actualScroll = 0, startScroll = 0, startX = 0, startY = 0, lastX = 0, lastY = 0
  let revision = 0, pending = false, signature = ''
  let scrolling: ReturnType<typeof setInterval> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null, suppressUntil = 0
  function cancel() {
    revision++; pending = false
    if (dragging.value) suppressUntil = Date.now() + 450
    if (timer) clearTimeout(timer)
    timer = null
    if (scrolling) clearInterval(scrolling)
    scrolling = null
    dragging.value = target.value = group.value = ''
    previewKeys.value = []
    offsetX.value = offsetY.value = 0
    // #ifdef WEB
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', finish)
    window.removeEventListener('blur', cancel)
    // #endif
  }
  function valid() { return !options.disabled() && signature === options.signature() }
  function update() {
    if (!dragging.value) return
    if (!valid()) { cancel(); return }
    const cell = rects.find(rect => rect.key === dragging.value)
    if (!cell) { cancel(); return }
    const delta = actualScroll - startScroll
    const from = rects.findIndex(rect => rect.key === dragging.value)
    const to = cardDropIndex(rects, dragging.value, lastX, lastY + delta)
    const keys = rects.map(rect => rect.key)
    keys.splice(to, 0, keys.splice(from, 1)[0])
    if (keys.join('|') !== previewKeys.value.join('|')) previewKeys.value = keys
    target.value = rects[to].key
    const projected = projectCardLayout(rects, keys)
    const slot = projected.find(rect => rect.key === dragging.value)
    const minLeft = Math.min(...rects.map(rect => rect.left)), maxRight = Math.max(...rects.map(rect => rect.right))
    const minTop = Math.min(...projected.map(rect => rect.top)), maxBottom = Math.max(...projected.map(rect => rect.bottom))
    // The actual grid makes room at the preview slot; only its floating content follows the pointer.
    const left = Math.max(minLeft, Math.min(maxRight - slot.width, cell.left + lastX - startX))
    const top = Math.max(minTop, Math.min(maxBottom - cell.height, cell.top + lastY - startY + delta))
    offsetX.value = left - slot.left
    offsetY.value = top - slot.top
    const oldBottom = Math.max(...rects.map(rect => rect.bottom))
    maxScroll = Math.max(0, contentHeight + maxBottom - oldBottom - viewport.height)
  }
  function start(cardGroup: string, key: string, event) {
    cancel()
    if (options.disabled() || (event.touches && event.touches.length !== 1)) return
    const point = event.touches?.[0] || event
    if (point.clientY == null) return
    pending = true
    const version = revision
    signature = options.signature()
    startX = lastX = point.clientX; startY = lastY = point.clientY; startScroll = actualScroll
    const keys = options.rows(cardGroup).map(item => item.cardKey)
    timer = setTimeout(() => {
      if (!pending || version !== revision || !valid()) return
      uni.createSelectorQuery().in(instance?.proxy)
        .select('.dashboard-scroll').boundingClientRect()
        .select('.dashboard-content').boundingClientRect()
        .selectAll('.home-order-' + cardGroup).boundingClientRect()
        .exec(result => {
          if (!pending || version !== revision || !valid()) return
          viewport = result?.[0]
          rects = (result?.[2] || []).map((rect, index) => ({ ...rect, key: rect.id?.slice('home-order-'.length) || keys[index] }))
            .filter(rect => rect.height > spacing.detail * 2 && rect.width > 0 && rect.key)
          if (!viewport || !rects.some(rect => rect.key === key) || rects.length < 2) { cancel(); return }
          contentHeight = result?.[1]?.height || 0
          maxScroll = Math.max(0, contentHeight - viewport.height)
          pending = false; dragging.value = target.value = key; group.value = cardGroup
          scrollTop.value = actualScroll
          update()
          uni.vibrateShort({ fail: () => {} })
          scrolling = setInterval(() => {
            if (!valid()) { cancel(); return }
            const step = lastY < viewport.top + spacing.controlMin ? -spacing.inline
              : lastY > viewport.bottom - spacing.controlMin ? spacing.inline : 0
            if (step) scrollTop.value = Math.max(0, Math.min(maxScroll, actualScroll + step))
          }, 40)
        })
    }, 300)
  }
  function move(event) {
    if (!pending && !dragging.value) return
    if (event.touches && event.touches.length !== 1) { cancel(); return }
    const point = event.touches?.[0] || event
    if (point.clientY == null) return
    lastX = point.clientX; lastY = point.clientY
    if (!dragging.value) {
      if (Math.max(Math.abs(lastX - startX), Math.abs(lastY - startY)) > spacing.inline) cancel()
      return
    }
    event.stopPropagation?.(); event.preventDefault?.()
    update()
  }
  function finish(event?) {
    if (!dragging.value) { cancel(); return }
    if (event?.changedTouches?.[0]) {
      lastX = event.changedTouches[0].clientX; lastY = event.changedTouches[0].clientY
    } else if (event?.clientY != null) { lastX = event.clientX; lastY = event.clientY }
    update()
    if (!dragging.value) return
    const cardGroup = group.value, keys = [...previewKeys.value]
    const changed = keys.some((key, index) => key !== rects[index].key), accepted = valid()
    // Apply the optimistic data order before clearing the preview, keeping the same slot on release.
    if (accepted && changed) void options.save(cardGroup, keys)
    cancel()
  }
  function mouseStart(cardGroup: string, key: string, event) {
    // #ifdef WEB
    if (event.button !== 0) return
    start(cardGroup, key, event)
    if (!pending && !dragging.value) return
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', finish)
    window.addEventListener('blur', cancel)
    // #endif
  }
  function scrolled(event) {
    actualScroll = event.detail.scrollTop
    if (pending && Math.abs(actualScroll - startScroll) > spacing.inline) cancel()
    update()
  }
  function clickBlocked() { return !!dragging.value || Date.now() < suppressUntil }
  function ordered(cardGroup: string, rows: any[], key = item => item.cardKey) {
    if (group.value !== cardGroup || !previewKeys.value.length) return rows
    const order = new Map(previewKeys.value.map((value, index) => [value, index]))
    const visible = rows.filter(item => order.has(key(item))).sort((a, b) => order.get(key(a)) - order.get(key(b)))
    let index = 0
    return rows.map(item => order.has(key(item)) ? visible[index++] : item)
  }
  function style(key: string) {
    if (dragging.value !== key) return {}
    const cell = rects.find(rect => rect.key === key)
    return { height: cell.height + 'px', zIndex: 10 }
  }
  function contentStyle(key: string) {
    if (dragging.value !== key) return {}
    return { transform: 'translate(' + offsetX.value + 'px,' + offsetY.value + 'px)' }
  }
  function scrollEnabled() {
    // #ifdef WEB
    return true
    // #endif
    // #ifndef WEB
    return !dragging.value
    // #endif
  }
  function keyboard(cardGroup: string, key: string, direction: number) {
    if (options.disabled()) return
    const keys = options.rows(cardGroup).map(item => item.cardKey)
    const from = keys.indexOf(key), to = from + direction
    if (from < 0 || to < 0 || to >= keys.length) return
    keys.splice(to, 0, keys.splice(from, 1)[0])
    void options.save(cardGroup, keys)
  }
  onUnmounted(cancel)
  return { dragging, target, previewKeys, ordered, contentStyle, scrollTop, start, mouseStart, move, finish, cancel, scrolled, style, scrollEnabled, keyboard, clickBlocked }
}
