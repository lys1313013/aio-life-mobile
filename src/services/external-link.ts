// 首页等主包入口使用的小工具，不引入 coding 业务服务与平台请求。
export function openExternalLink(url: string) {
  if (!/^https:\/\/[^\s\\]+$/i.test(url)) return
  // #ifdef WEB
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifdef APP
  plus.runtime.openURL(url)
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({ data: url })
  // #endif
}
