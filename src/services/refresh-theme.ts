import { ref, onUnmounted } from 'vue'

// 原生下拉指示器跟随系统主题，不依赖浏览器 DOM。
export function useRefreshTheme() {
  const style = ref(uni.getAppBaseInfo().theme === 'dark' ? 'white' : 'black')
  function change(event) {
    style.value = event.theme === 'dark' ? 'white' : 'black'
  }
  uni.onThemeChange(change)
  onUnmounted(() => uni.offThemeChange(change))
  return style
}
