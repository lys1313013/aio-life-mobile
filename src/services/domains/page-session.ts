import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { onUnmounted, watch } from 'vue'
import { fetchUser } from '../api.ts'
import { restoreSession, session } from '../session.ts'
import { currentPageAccess, usePageRefresh } from '../page-refresh.ts'
import type { PageRefreshOptions } from '../page-refresh.ts'

export function useDomainPage(resume: (refresh: boolean) => unknown, suspend: (clear: boolean) => void, options?: PageRefreshOptions) {
  let visible = false, owner = session.token, generation = 0, shown = false
  const refresh = options ? usePageRefresh(() => resume(true), options) : () => resume(true)
  function stop(clear = false) { visible = false; generation++; suspend(clear) }
  onShow(async () => {
    restoreSession()
    visible = true
    const token = session.token, version = ++generation
    if (!token) { stop(true); uni.reLaunch({ url: '/pages/login/index' }); return }
    if (owner !== token || (shown && currentPageAccess().expired)) suspend(true)
    owner = token
    shown = true
    try { if (!session.user) await fetchUser() } catch { /* 业务查询仍提供错误反馈及重试。 */ }
    if (!visible || version !== generation || token !== session.token) return
    resume(false)
    refresh()
  })
  onHide(() => stop())
  onUnload(() => stop(true))
  onUnmounted(() => stop(true))
  watch(() => session.token, token => {
    generation++; owner = token; suspend(true)
    if (visible && token) { resume(false); refresh() }
  }, { flush: 'sync' })
}
