import spacing from '../../../styles/spacing.json'
import { navigationContentLayout } from '../../../services/navigation-layout.ts'

export const timeHeaderLayout = {
  contentMinWidth: 4 * spacing.controlMin,
  actionsMinWidth: 6 * spacing.controlMin + 2 * spacing.inline,
  compactActions: true,
}

// 微信窗口包含页面内底栏；先按真实导航/胶囊和安全区预留，随后以滚动容器实测值校准。
export function initialTimeViewportHeight(windowInfo, capsule) {
  const header = navigationContentLayout(windowInfo, capsule, spacing, timeHeaderLayout)
  return Math.max(spacing.controlMin * 2, windowInfo.windowHeight - header.statusBarHeight
    - header.headerHeight - spacing.tabBarHeight - (windowInfo.safeAreaInsets?.bottom || 0) - spacing.detail)
}
