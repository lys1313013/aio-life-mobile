import { computed, reactive } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
const storageKey = 'aio-life-mobile.theme.v1'
export const theme = reactive({ mode: 'system' as ThemeMode, system: 'light' })
export const isDark = computed(
  () => (theme.mode === 'system' ? theme.system : theme.mode) === 'dark'
)
let initialized = false

function applyNativeTheme() {
  const dark = isDark.value
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
  uni.setTabBarStyle({
    color: '#8b8f99',
    selectedColor: '#5b8ff9',
    backgroundColor: dark ? '#1c1e22' : '#ffffff',
    borderStyle: dark ? 'black' : 'white',
    fail: () => {}
  })
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
  try {
    const saved = uni.getStorageSync(storageKey)
    if (saved === 'light' || saved === 'dark' || saved === 'system')
      theme.mode = saved
  } catch (_) {
    /* 存储不可读时仍可跟随系统 */
  }
  applyNativeTheme()
  uni.onThemeChange((event) => {
    theme.system = event.theme
    applyNativeTheme()
  })
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
