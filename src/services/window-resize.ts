import { onMounted, onUnmounted } from 'vue'
import { onResize } from '@dcloudio/uni-app'

/** App 使用页面生命周期；组件销毁后停止分发，避免调用仅 Web/小程序提供的 API。 */
export function useWindowResize(callback: () => void) {
  // #ifdef APP
  let active = true
  onResize(() => { if (active) callback() })
  onUnmounted(() => { active = false })
  // #endif
  // #ifndef APP
  onMounted(() => uni.onWindowResize(callback))
  onUnmounted(() => uni.offWindowResize(callback))
  // #endif
}
