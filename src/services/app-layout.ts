import { ref } from 'vue'
import { onResize, onShow } from '@dcloudio/uni-app'
import spacing from '../styles/spacing.json'
import { isDark } from './theme.ts'

let app = false
// #ifdef APP
app = true
// #endif

/** 原生布局差异集中处理；Web/小程序继续使用现有 CSS。 */
export function useAppLayout() {
  const size = ref(app ? uni.getWindowInfo() : { windowWidth: 0, windowHeight: 0 })
  function refresh() { size.value = uni.getWindowInfo() }
  if (app) { onResize(refresh); onShow(refresh) }
  function appGridItem(columns: number, gapToken: keyof typeof spacing, breakpoints: number[][] = [], full = false) {
    if (!app) return {}
    const gap = spacing[gapToken]
    let expanded = false
    for (const [width, count] of breakpoints) if (size.value.windowWidth >= width) { columns = count; expanded = true }
    if (full && !expanded) columns = 1
    return { width: `calc((100% - ${gap * (columns - 1)}px) / ${columns})`, marginBottom: `${gap}px`, flexGrow: 0, flexShrink: 0 }
  }
  function appViewport(fraction: number, property = 'height') {
    return app ? { [property]: `${Math.round(size.value.windowHeight * fraction)}px` } : {}
  }
  function appLedgerCell(first: boolean) {
    if (!app) return {}
    const periodWidth = size.value.windowWidth <= 360 ? 64 : 72
    return { width: first ? `${periodWidth}px` : `calc((100% - ${periodWidth + spacing.detail * 3}px) / 3)`, flexGrow: 0, flexShrink: 0 }
  }
  return { appGridItem, appViewport, appLedgerCell }
}

export function appTextColor(active = false) {
  return app ? { color: active ? (isDark.value ? '#9bbcff' : '#2563eb') : (isDark.value ? '#eeeeef' : '#27272a') } : {}
}

export function appButtonTextColor(primary = true) {
  return app ? { color: primary ? '#ffffff' : (isDark.value ? '#eeeeef' : '#334155') } : {}
}
