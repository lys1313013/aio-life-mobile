import { computed, reactive } from 'vue'
import colors from '../theme.json'
import tabs from './tab-bar.generated.json'

export type ThemeMode = 'system' | 'light' | 'dark'
const storageKey = 'aio-life-mobile.theme.v1'
export const theme = reactive({ mode: 'system' as ThemeMode, system: 'light' })
export const isDark = computed(
  () => (theme.mode === 'system' ? theme.system : theme.mode) === 'dark'
)
// MobileSwitch 统一使用主题开启色。
export const switchActiveColor = computed(
  () => (isDark.value ? colors.dark : colors.light).switchActiveColor
)
let initialized = false

// 与底栏资源生成器的深色文件名一致；微信页面底栏和 H5 / App 共用。
export function tabIconPath(path: string, dark: boolean): string {
  return dark ? path.replace(/\.png$/, '-dark.png') : path
}

function applyNativeTheme() {
  const dark = isDark.value
  const palette = dark ? colors.dark : colors.light
  // #ifdef APP
  uni.setAppTheme({ theme: theme.mode === 'system' ? 'auto' : theme.mode })
  // #endif
  // #ifdef WEB
  // 当前 H5 的 useTabBar 在 darkmode 下复制主题状态，setTabBarStyle 未同步到渲染实例。
  // 仅 Web 用 CSS 变量同步底栏，其他平台仍使用原生 API。
  document.documentElement.style.setProperty('--aio-tab-background', dark ? '#1c1e22' : '#ffffff')
  document.documentElement.style.setProperty('--aio-tab-border', dark ? '#1c1e22' : '#ffffff')
  document.documentElement.style.setProperty('--aio-native-text', dark ? '#eeeeef' : '#27272a')
  document.documentElement.style.setProperty('--aio-native-surface-rgb', dark ? '28, 30, 34' : '255, 255, 255')
  document.documentElement.style.setProperty('--aio-native-border', dark ? '#45474d' : '#d4d4d8')
  document.documentElement.style.setProperty('--aio-native-accent', dark ? '#9bbcff' : '#1d4ed8')
  document.documentElement.style.setProperty('--aio-native-active', dark ? '#303846' : '#edf3ff')
  // #endif
  // #ifndef MP-WEIXIN
  uni.setTabBarStyle({
    color: palette.tabColor,
    selectedColor: palette.tabSelectedColor,
    backgroundColor: palette.tabBackgroundColor,
    borderStyle: dark ? 'black' : 'white',
    fail: () => {}
  })
  tabs.forEach((tab, index) => {
    let iconPath = tabIconPath(tab.iconPath, dark)
    let selectedIconPath = tabIconPath(tab.selectedIconPath, dark)
    // #ifdef WEB
    // setTabBarItem 的相对路径会按当前页面解析；H5 静态资源从站点根目录读取。
    iconPath = '/' + iconPath.replace(/^\/+/, '')
    selectedIconPath = '/' + selectedIconPath.replace(/^\/+/, '')
    // #endif
    uni.setTabBarItem({
      index,
      iconPath,
      selectedIconPath,
      fail: () => {}
    })
  })
  // #endif
  uni.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#111215' : '#f0f2f5',
    fail: () => {}
  })
  // #ifdef MP-WEIXIN
  uni.setBackgroundColor({
    backgroundColor: dark ? '#111215' : '#f0f2f5',
    backgroundColorTop: dark ? '#111215' : '#f0f2f5',
    backgroundColorBottom: dark ? '#111215' : '#f0f2f5',
    fail: () => {}
  })
  // #endif
}

export function initializeTheme() {
  if (initialized) return
  initialized = true
  theme.system = uni.getAppBaseInfo().theme === 'dark' ? 'dark' : 'light'
  // #ifdef APP
  theme.system = uni.getDeviceInfo().osTheme === 'dark' ? 'dark' : 'light'
  // #endif
  try {
    const saved = uni.getStorageSync(storageKey)
    if (saved === 'light' || saved === 'dark' || saved === 'system')
      theme.mode = saved
  } catch (_) {
    /* 存储不可读时仍可跟随系统 */
  }
  applyNativeTheme()
  // #ifndef APP
  uni.onThemeChange((event) => {
    theme.system = event.theme
    applyNativeTheme()
  })
  // #endif
  // #ifdef APP
  uni.onOsThemeChange((event) => {
    theme.system = event.osTheme
    applyNativeTheme()
  })
  // #endif
}

export function setThemeMode(mode: ThemeMode) {
  try {
    uni.setStorageSync(storageKey, mode)
  } catch (_) {
    throw new Error('无法保存主题，请检查设备存储后重试')
  }
  theme.mode = mode
  applyNativeTheme()
}

// 简单类选择器兼容 Vapor；所有页面共用同一份响应式主题。
function classNames(value): string[] {
  if (typeof value === 'string') return value.split(' ').filter(Boolean)
  if (Array.isArray(value)) return value.flatMap(classNames)
  if (value && typeof value === 'object')
    return Object.keys(value).filter((name) => value[name])
  return []
}
export function themeClass(classes) {
  return isDark.value
    ? classNames(classes)
        .map((name) => name + '-dark')
        .join(' ')
    : ''
}

export function refreshNativeTheme() {
  applyNativeTheme()
}
