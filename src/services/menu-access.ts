import { watch } from 'vue'
import { request } from './api.ts'
import { isBusinessDestination, lockedMenuPaths } from './life-catalog.ts'
import { requestUnlock, unlockNavigationRevision, isMenuUnlocked, setMenuChecking } from './secondary-lock.ts'
import { session } from './session.ts'
import { cachedMenuAccess, loadMenuAccess } from './menu-access-cache.ts'

let warmupInstalled = false
export function installMenuAccessWarmup() {
  if (warmupInstalled) return
  warmupInstalled = true
  watch(() => session.token, (token) => {
    // 登录及恢复会话时预取，正常切换页面只查内存。失败不缓存，点击时重新检查。
    if (token) void loadMenuAccess(request).catch(() => {})
  }, { immediate: true, flush: 'post' })
}

export function needsMenuCheck(url: string) {
  return !!session.token && isBusinessDestination(url)
}

export async function checkMenuAccess(url: string) {
  const token = session.token
  const revision = unlockNavigationRevision()
  const current = () => token === session.token && revision === unlockNavigationRevision()
  let config = cachedMenuAccess()
  if (!config) {
    setMenuChecking(true)
    try {
      config = await loadMenuAccess(request)
    } finally {
      // 旧检查结束时不能收起新检查的 loading。
      if (current()) setMenuChecking(false)
    }
  }
  if (!current()) throw new Error('页面已变化，请重新操作')
  const paths = lockedMenuPaths(url, config.menus, config.ids)
  for (const path of paths) {
    if (!isMenuUnlocked(path)) await requestUnlock(path, token)
    if (!current()) throw new Error('页面已变化，请重新操作')
  }
}
