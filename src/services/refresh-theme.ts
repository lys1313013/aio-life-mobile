import { computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { isDark, refreshNativeTheme } from './theme.ts'

export function useRefreshTheme() {
  onShow(() => nextTick(refreshNativeTheme))
  return computed(() => (isDark.value ? 'white' : 'black'))
}
