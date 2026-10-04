import type { Ref } from 'vue'
import { getCurrentInstance, onUnmounted, ref } from 'vue'
import { applyCardOrder, previewCardMove } from './card-order.ts'
import spacing from '../styles/spacing.json'

/** 普通移动交给页面；静止长按后才接管排序，不依赖 DOM 或浏览器拖放库。 */
export function useCardOrder(options: {
  rows: Ref<any[]>;
  visible: () => any[];
  disabled: () => boolean;
  save: (move: { id: string; targetId: string; after: boolean }) => Promise<any>;
  descending?: boolean;
  activated?: () => void;
  changed?: (rows: any[]) => void;
}) {
  const instance = getCurrentInstance()
  const dragging = ref(''), target = ref(''), after = ref(false), saving = ref('')
  const offsetX = ref(0), offsetY = ref(0), scrollTop = ref(0)
  let actualScroll = 0, startScroll = 0, startX = 0, startY = 0, lastX = 0, lastY = 0
  let rects: any[] = [], ids: string[] = [], from = -1, revision = 0, requestRevision = 0, suppressUntil = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let scrolling: ReturnType<typeof setInterval> | null = null
  let maxScroll = 0, viewportHeight = 0
  function cancel() {
    revision++
    if (timer) clearTimeout(timer)
    if (scrolling) clearInterval(scrolling)
    timer = scrolling = null
    if (dragging.value) suppressUntil = Date.now() + 450
    dragging.value = target.value = ''; offsetX.value = offsetY.value = 0
  }
  function reset() { cancel(); requestRevision++; saving.value = '' }
  function blocked() { return !!saving.value || options.disabled() }
  function sameRows() { return ids.join(',') === options.visible().map(row => row.id).join(',') }
  function point(event) { return event.touches?.[0] || event.changedTouches?.[0] }
  function update() {
    if (!dragging.value) return
    if (!sameRows()) { cancel(); return }
    const delta = actualScroll - startScroll
    offsetX.value = lastX - startX; offsetY.value = lastY - startY + delta
    let nearest = from, distance = Infinity
    rects.forEach((rect, index) => {
      const x = Math.max(rect.left, Math.min(rect.right, lastX))
      const y = Math.max(rect.top - delta, Math.min(rect.bottom - delta, lastY))
      const d = (lastX - x) ** 2 + (lastY - y) ** 2
      if (d < distance) { distance = d; nearest = index }
    })
    target.value = ids[nearest] || ''; after.value = nearest > from
  }
  function start(id, event) {
    if (event.touches?.length !== 1) { cancel(); return }
    if (blocked()) return
    cancel()
    const p = point(event), version = revision
    startX = lastX = p.clientX; startY = lastY = p.clientY; startScroll = actualScroll
    ids = options.visible().map(row => row.id); from = ids.indexOf(id)
    if (from < 0 || ids.length < 2) return
    timer = setTimeout(() => {
      if (version !== revision || blocked() || !sameRows()) return
      uni.createSelectorQuery().in(instance?.proxy).selectAll('.card-sort-item').boundingClientRect().exec(result => {
        if (version !== revision || blocked() || !sameRows()) return
        rects = result?.[0] || []
        if (rects.length !== ids.length) return
        options.activated?.()
        dragging.value = id; target.value = id
        viewportHeight = uni.getWindowInfo().windowHeight
        maxScroll = Math.max(actualScroll, ...rects.map(rect => rect.bottom + actualScroll - viewportHeight + spacing.section))
        uni.vibrateShort({ fail: () => {} })
        scrolling = setInterval(() => {
          const step = lastY < spacing.controlMin * 2 ? -spacing.inline : lastY > viewportHeight - spacing.controlMin ? spacing.inline : 0
          if (step) scrollTop.value = Math.max(0, Math.min(maxScroll, actualScroll + step))
        }, 40)
      })
    }, 300)
  }
  function move(event) {
    if (event.touches?.length !== 1) { cancel(); return }
    const p = point(event)
    lastX = p.clientX; lastY = p.clientY
    if (!dragging.value) {
      if (Math.max(Math.abs(lastX - startX), Math.abs(lastY - startY)) > spacing.inline) cancel()
      return
    }
    event.preventDefault?.(); event.stopPropagation?.()
    update()
  }
  function scrolled(event) {
    actualScroll = event.detail.scrollTop
    if (!dragging.value && timer && Math.abs(actualScroll - startScroll) > spacing.inline) cancel()
    // 同步当前值，让第一次边缘滚动也能触发原生 scroll-top 更新。
    scrollTop.value = actualScroll
    update()
  }
  async function save(move) {
    if (blocked() || move.id === move.targetId) return
    const version = ++requestRevision
    const original = options.rows.value.map(row => ({ id: row.id, sortOrder: row.sortOrder }))
    saving.value = move.id
    options.rows.value = previewCardMove(options.rows.value, move, options.descending)
    try {
      const ranks = await options.save(move)
      if (version !== requestRevision) return
      options.rows.value = applyCardOrder(options.rows.value, ranks)
      options.changed?.(options.rows.value)
    } catch (error) {
      if (version !== requestRevision) return
      options.rows.value = applyCardOrder(options.rows.value, original)
      uni.showToast({ title: error.message || '排序保存失败，请重试', icon: 'none' })
    } finally { if (version === requestRevision) saving.value = '' }
  }
  function finish(event) {
    if (!dragging.value) { cancel(); return }
    event?.preventDefault?.(); event?.stopPropagation?.()
    const move = { id: dragging.value, targetId: target.value, after: after.value }
    const valid = sameRows()
    cancel()
    if (valid && move.targetId) void save(move)
  }
  function keyboard(id, delta) {
    const rows = options.visible(), index = rows.findIndex(row => row.id === id), next = rows[index + delta]
    if (next) void save({ id, targetId: next.id, after: delta > 0 })
  }
  function clickBlocked() { return !!dragging.value || !!saving.value || Date.now() < suppressUntil }
  function style(id) { return dragging.value === id ? { transform: 'translate(' + offsetX.value + 'px,' + offsetY.value + 'px)', zIndex: 100, position: 'relative' } : {} }
  function classes(id) { return { 'card-order-dragging': dragging.value === id, 'card-order-before': !!dragging.value && target.value === id && dragging.value !== id && !after.value, 'card-order-after': !!dragging.value && target.value === id && dragging.value !== id && after.value } }
  onUnmounted(reset)
  return { dragging, saving, scrollTop, start, move, finish, cancel, reset, keyboard, clickBlocked, style, classes, scrolled }
}
