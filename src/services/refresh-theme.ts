import { computed, nextTick } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { isDark, refreshNativeTheme } from './theme.ts'

export function useRefreshTheme() {
  // #ifdef MP-WEIXIN
  // 首次创建的窗口先使用宿主主题；加载/显示时立即同步，不能等 Vue 渲染完成。
  // 缓存 Tab 再次显示时也要重设，覆盖在其他页面修改主题或系统主题变化的情况。
  onLoad(refreshNativeTheme)
  onShow(refreshNativeTheme)
  // #endif
  // #ifndef MP-WEIXIN
  onShow(() => nextTick(refreshNativeTheme))
  // #endif
  return computed(() => (isDark.value ? 'white' : 'black'))
}
