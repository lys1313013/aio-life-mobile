import { ref } from 'vue'
import spacing from '../styles/spacing.json'
import tabs from './tab-bar.generated.json'

// 页面传入自身路由，高亮不依赖旧底栏实例或异步 setData 同步。
export function useTabNavigation(pagePath: string) {
  const switching = ref(false)
  function switchTab(index: number) {
    const tab = tabs[index]
    if (!tab || switching.value || tab.pagePath === pagePath) return
    switching.value = true
    uni.switchTab({
      url: '/' + tab.pagePath,
      fail: () => uni.showToast({ title: '切换失败，请重试', icon: 'none' }),
      complete: () => { switching.value = false },
    })
  }
  return { switching, switchTab }
}

// 固定定位的悬浮按钮需要避让页面内底栏；弹窗使用整个视口，不扣除底栏。
export function tabBarInset() {
  // #ifdef MP-WEIXIN
  const pages = getCurrentPages()
  const route = pages[pages.length - 1]?.route || ''
  return tabs.some(tab => tab.pagePath === route) ? spacing.tabBarHeight : 0
  // #endif
  // #ifndef MP-WEIXIN
  return 0
  // #endif
}
