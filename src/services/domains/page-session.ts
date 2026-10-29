import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { onUnmounted, provide, readonly, ref, watch } from 'vue'
import { fetchUser } from '../api.ts'
import { restoreSession, session } from '../session.ts'
import { currentPageAccess, usePageRefresh } from '../page-refresh.ts'
import type { PageRefreshOptions } from '../page-refresh.ts'

export function useDomainPage(resume: (refresh: boolean) => unknown, suspend: (clear: boolean) => void, options?: PageRefreshOptions) {
  let visible = false, owner = session.token, generation = 0, shown = false
  const initializing = ref(false)
  const domainRevision = ref(0)
  provide('domain-page-initializing', readonly(initializing))
  provide('domain-page-revision', readonly(domainRevision))
  const refresh = options ? usePageRefresh(() => resume(true), options) : () => resume(true)
  function suspendPage(clear: boolean) {
    // 数据被权限/账号清理后，子区域不能把上一数据域的成功空态当成当前内容。
    if (clear) domainRevision.value++
    suspend(clear)
  }
  function stop(clear = false) { visible = false; generation++; initializing.value = false; suspendPage(clear) }
  async function enter(forceUser = false) {
    const token = session.token, version = ++generation
    if (!token) { stop(true); uni.reLaunch({ url: '/pages/login/index' }); return }
    if (owner !== token || (shown && currentPageAccess().expired)) suspendPage(true)
    owner = token
    shown = true
    initializing.value = forceUser || !session.user
    try { if (initializing.value) await fetchUser() } catch { /* 业务查询仍提供错误反馈及重试。 */ }
    if (!visible || version !== generation || token !== session.token) return
    resume(false)
    refresh()
    initializing.value = false
  }
  onShow(() => {
    restoreSession()
    visible = true
    void enter()
  })
  onHide(() => stop())
  onUnload(() => stop(true))
  onUnmounted(() => stop(true))
  watch(() => session.token, token => {
    generation++; owner = token; initializing.value = false; suspendPage(true)
    // saveToken 更新 token 后才清空 user；这里必须重新取当前账号资料，不能复用旧角色。
    if (visible && token) void enter(true)
  }, { flush: 'sync' })
  return { initializing }
}
