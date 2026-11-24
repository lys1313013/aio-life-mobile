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
  function gridColumns(columns: number, breakpoints: number[][], full = false) {
    let expanded = false
    for (const [width, count] of breakpoints) if (size.value.windowWidth >= width) { columns = count; expanded = true }
    return full && !expanded ? 1 : columns
  }
  function appGridItem(columns: number, gapToken: keyof typeof spacing, breakpoints: number[][] = [], full = false) {
    if (!app) return {}
    const gap = spacing[gapToken]
    columns = gridColumns(columns, breakpoints, full)
    return { width: `calc((100% - ${gap * (columns - 1)}px) / ${columns})`, marginBottom: `${gap}px`, flexGrow: 0, flexShrink: 0 }
  }
  function appGridCell(index: number, length: number, columns: number, gapToken: keyof typeof spacing, breakpoints: number[][] = []) {
    if (!app) return {}
    columns = gridColumns(columns, breakpoints)
    const gap = spacing[gapToken]
    const column = index % columns
    return {
      width: `calc((100% - ${gap * (columns - 1)}px) / ${columns})`,
      marginRight: column < columns - 1 ? `${gap}px` : '0px',
      marginBottom: index - column + columns < length ? `${gap}px` : '0px',
      flexGrow: 0,
      flexShrink: 0,
    }
  }
  function appViewport(fraction: number, property = 'height') {
    return app ? { [property]: `${Math.round(size.value.windowHeight * fraction)}px` } : {}
  }
  function appLedgerCell(first: boolean) {
    if (!app) return {}
    const periodWidth = size.value.windowWidth <= 360 ? 64 : 72
    return { width: first ? `${periodWidth}px` : `calc((100% - ${periodWidth + spacing.detail * 3}px) / 3)`, flexGrow: 0, flexShrink: 0 }
  }
  return { appGridItem, appGridCell, appViewport, appLedgerCell }
}

export function appTextColor(active = false) {
  return app ? { color: active ? (isDark.value ? '#9bbcff' : '#2563eb') : (isDark.value ? '#eeeeef' : '#27272a') } : {}
}

export function appButtonTextColor(primary = true) {
  return app ? { color: primary ? '#ffffff' : (isDark.value ? '#eeeeef' : '#334155') } : {}
}
