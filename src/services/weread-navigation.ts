import { isMobileBrowser, wereadAppLink, wereadBrowserLink, wereadWebLink } from './weread-links.ts'
// #ifdef APP-ANDROID
import { openWereadBook, openWereadWeb } from '../uni_modules/aio-weread-launcher'
// #endif

/** 两个阅读入口共用：尝试唤起后均保留显式网页版入口，失败不自动跳走。 */
export function tryOpenWereadApp(bookId: string, webLink = ''): 'opened' | 'failed' | 'unavailable' {
  if (!wereadAppLink(bookId)) return 'unavailable'
  // #ifdef WEB
  if (isMobileBrowser(navigator.userAgent, navigator.maxTouchPoints)) {
    window.location.assign(wereadBrowserLink(bookId, navigator.userAgent, webLink))
    return 'opened'
  }
  // #endif
  // #ifdef APP-ANDROID
  return openWereadBook(bookId) ? 'opened' : 'failed'
  // #endif
  return 'unavailable'
}

export function openWereadLink(url: string) {
  const link = wereadWebLink(url)
  if (!link) throw Error('暂无可用链接，点击重试')
  // #ifdef WEB
  window.open(link, '_blank', 'noopener,noreferrer')
  // noopener 模式可能返回 null，不能据此误报打开失败。
  // #endif
  // #ifdef APP-ANDROID
  if (!openWereadWeb(link)) throw Error('无法打开阅读链接')
  // #endif
  // #ifdef APP-IOS
  plus.runtime.openURL(link)
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({ data: link })
  // #endif
}

/** 在点击事件内预开浏览器窗口，异步查询后再填入链接，避免弹窗拦截。 */
export function prepareWereadWebTarget() {
  // #ifdef WEB
  const target = window.open('about:blank', '_blank')
  if (target) target.opener = null
  // #endif
  return {
    open(url: string) {
      const link = wereadWebLink(url)
      if (!link) throw Error('暂无可用链接，点击重试')
      // #ifdef WEB
      if (!target || target.closed) throw Error('链接已就绪，请再次点击打开')
      target.location.replace(link)
      // #endif
      // #ifndef WEB
      openWereadLink(link)
      // #endif
    },
    close() {
      // #ifdef WEB
      target?.close()
      // #endif
    },
  }
}
