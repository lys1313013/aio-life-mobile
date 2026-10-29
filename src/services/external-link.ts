// #ifdef APP-ANDROID
import { openExternalWeb } from '../uni_modules/aio-external-link'
// #endif
// 首页等主包入口使用的小工具，不引入 coding 业务服务与平台请求。
export function openExternalLink(url: string) {
  if (!/^https:\/\/[^\s\\]+$/i.test(url)) return
  // #ifdef WEB
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifdef APP-ANDROID
  if (!openExternalWeb(url)) uni.showToast({ title: '无法打开链接，请重试', icon: 'none' })
  // #endif
  // #ifdef APP-IOS
  plus.runtime.openURL(url)
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({ data: url })
  // #endif
}
