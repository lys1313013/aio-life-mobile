import { nextTick, watch } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { restoreSession, session } from './session.ts'
import { cachedMenuAccess } from './menu-access-cache.ts'
import { lockedMenuPaths } from './life-catalog.ts'
import { isMenuUnlocked } from './secondary-lock.ts'
import { createPageFreshness, pageDataSignature } from './page-refresh-state.ts'

export function currentPageAccess() {
  const config = cachedMenuAccess()
  const page = getCurrentPages().slice(-1)[0]
  const route = page?.route
  if (!config || !route) return { signature: 'unknown', expired: true }
  // kind/admin 等参数决定所属菜单，编辑记录等附加参数由匹配器忽略。
  const query = Object.entries(page.options || {}).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&')
  const paths = lockedMenuPaths('/' + route.replace(/^\//, '') + (query ? '?' + query : ''), config.menus, config.ids)
  return { signature: paths.map(path => path + ':' + isMenuUnlocked(path)).join('|'), expired: paths.some(path => !isMenuUnlocked(path)) }
}

export type PageRefreshOptions = {
  loading: () => boolean
  error: () => string
  keys: () => string[]
  context?: () => string
}

// 仅限制 onShow 的自动查询。手动刷新、筛选和保存回调继续直接调用页面 load。
export function usePageRefresh(load: () => unknown, options: PageRefreshOptions) {
  const freshness = createPageFreshness()
  let visible = true
  let started: { owner: string; data: string; access: string; context: string } | null = null
  let waiting = false
  let generation = 0
  const dataSignature = () => pageDataSignature([...options.keys(), 'menu', 'auth'])
  const signature = () => JSON.stringify([dataSignature(), currentPageAccess().signature, options.context?.() || ''])
  watch(options.loading, (loading, previous) => {
    if (loading) started = { owner: session.token, data: dataSignature(), access: currentPageAccess().signature, context: options.context?.() || '' }
    else if (previous) {
      const completed = started, version = generation
      started = null
      void nextTick(() => {
        if (visible && version === generation && completed?.owner === session.token && !options.error()) {
          // 首次启动的菜单预取可能晚于查询开始，完成后使用已经取得的锁配置。
          const access = completed.access === 'unknown' ? currentPageAccess().signature : completed.access
          freshness.loaded(completed.owner, JSON.stringify([completed.data, access, completed.context]))
        }
        if (visible && waiting) { waiting = false; refresh() }
      })
    }
  }, { flush: 'sync' })
  onShow(() => { visible = true })
  onHide(() => { visible = false; generation++; started = null; waiting = false })
  watch(() => session.token, () => { generation++; freshness.clear(); started = null; waiting = false }, { flush: 'sync' })
  function refresh() {
    if (!visible) return
    restoreSession()
    if (!session.token) { uni.reLaunch({ url: '/pages/login/index' }); return }
    if (!currentPageAccess().expired && !options.error() && !freshness.needed(session.token, signature())) return
    if (options.loading()) { waiting = true; return }
    return load()
  }
  return refresh
}
