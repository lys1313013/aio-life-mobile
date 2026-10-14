import { getCurrentInstance, onUnmounted, ref } from 'vue'
import spacing from '../../../styles/spacing.json'
import { closestCard, projectCardLayout } from './home-card-order.ts'

/** 长按后才接管手势；拖动时预览位置，松手后一次性更新草稿。 */
export function useQuickNavDrag(options: {
  items: () => { menuId: string }[];
  disabled: () => boolean;
  reorder: (ids: string[]) => void;
  dragging: (value: boolean) => void;
}) {
  const instance = getCurrentInstance()
  const dragging = ref('')
  const preview = ref<string[]>([])
  const x = ref(0), y = ref(0)
  let rects: any[] = []
  let startX = 0, startY = 0, pendingId = '', version = 0, suppressUntil = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    version++
    if (timer) clearTimeout(timer)
    timer = null
    pendingId = ''
    if (dragging.value) suppressUntil = Date.now() + 450
    dragging.value = ''
    preview.value = []
    options.dragging(false)
    // #ifdef WEB
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', finish)
    window.removeEventListener('blur', cancel)
    // #endif
  }
  function start(id: string, event: any, mouse = false) {
    cancel()
    if (options.disabled() || (mouse && event.button !== 0) || (event.touches && event.touches.length !== 1)) return
    const point = event.touches?.[0] || event
    if (point.clientX == null || point.clientY == null) return
    pendingId = id
    startX = x.value = point.clientX
    startY = y.value = point.clientY
    const current = version
    const ids = options.items().map(item => item.menuId)
    timer = setTimeout(() => {
      uni.createSelectorQuery().in(instance?.proxy).selectAll('.quick-editor-tile').boundingClientRect(result => {
        if (current !== version || pendingId !== id || options.disabled() || !Array.isArray(result)) return
        if (ids.join('|') !== options.items().map(item => item.menuId).join('|') || result.length !== ids.length) { cancel(); return }
        rects = result.map((rect, index) => ({ ...rect, key: ids[index] }))
        pendingId = ''
        dragging.value = id
        preview.value = ids
        options.dragging(true)
        uni.vibrateShort({ fail: () => {} })
      }).exec()
    }, 300)
    // #ifdef WEB
    if (mouse) {
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', finish)
      window.addEventListener('blur', cancel)
    }
    // #endif
  }
  function move(event: any) {
    if (!pendingId && !dragging.value) return
    if (options.disabled() || (event.touches && event.touches.length > 1)) { cancel(); return }
    const point = event.touches?.[0] || event.changedTouches?.[0] || event
    if (point.clientX == null || point.clientY == null) return
    x.value = point.clientX; y.value = point.clientY
    if (!dragging.value) {
      if (Math.max(Math.abs(x.value - startX), Math.abs(y.value - startY)) > spacing.inline) cancel()
      return
    }
    event.preventDefault?.()
    event.stopPropagation?.()
    const target = closestCard(rects, x.value, y.value)
    const ids = rects.map(rect => rect.key)
    const from = ids.indexOf(dragging.value), to = ids.indexOf(target)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    if (ids.join('|') !== preview.value.join('|')) preview.value = ids
  }
  function finish(event: any) {
    if (dragging.value && !options.disabled()) {
      move(event)
      const ids = [...preview.value]
      if (ids.length && ids.some((id, index) => id !== options.items()[index]?.menuId)) options.reorder(ids)
    }
    cancel()
  }
  function style(id: string) {
    if (!dragging.value) return {}
    if (id === dragging.value) return { transform: `translate(${x.value - startX}px, ${y.value - startY}px)`, zIndex: 10 }
    const from = rects.find(rect => rect.key === id)
    const to = projectCardLayout(rects, preview.value).find(rect => rect.key === id)
    return from && to ? { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` } : {}
  }
  function clickBlocked() { return !!dragging.value || Date.now() < suppressUntil }
  uni.onWindowResize(cancel)
  onUnmounted(() => { cancel(); uni.offWindowResize(cancel) })
  return { dragging, start, move, finish, cancel, style, clickBlocked }
}
