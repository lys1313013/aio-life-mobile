import { reactive, watch } from 'vue'
import { session } from './session.ts'

export const secondaryLock = reactive({ menuPath: '', token: '', visible: false, checking: false })
const pending: Array<{ path: string; token: string; resolve: () => void; reject: (reason: Error) => void }> = []
let navigationRevision = 0
let lifecycleInstalled = false
const unlockedPaths = new Map<string, number>()
export function setMenuChecking(value: boolean) {
  secondaryLock.checking = value
}
export function isMenuUnlocked(path: string) { return (unlockedPaths.get(path) || 0) > Date.now() }
export function unlockNavigationRevision() { return navigationRevision }
export function invalidateUnlocks() { navigationRevision++; cancelUnlock(); setMenuChecking(false) }
function resumeNavigation(name: string, options: any) {
  // H5 生产编译按静态调用收集 uni API；动态 uni[name] 会在裁剪后丢失方法。
  switch (name) {
    case 'navigateTo': return uni.navigateTo(options)
    case 'redirectTo': return uni.redirectTo(options)
    case 'reLaunch': return uni.reLaunch(options)
    case 'switchTab': return uni.switchTab(options)
    case 'navigateBack': return uni.navigateBack(options)
  }
}
export function installUnlockLifecycle(needsCheck?: (url: string) => boolean, checkAccess?: (url: string) => Promise<void>) {
  if (lifecycleInstalled) return
  lifecycleInstalled = true
  let resuming = false
  for (const name of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack']) {
    uni.addInterceptor(name, { invoke: (options) => {
      if (resuming) { resuming = false; return }
      invalidateUnlocks()
      if (!options?.url || !needsCheck?.(options.url) || !checkAccess) return
      const revision = navigationRevision
      checkAccess(options.url).then(() => {
        if (revision !== navigationRevision) return
        resuming = true
        try { resumeNavigation(name, options) } finally { resuming = false }
      }).catch((error) => {
        if (revision !== navigationRevision) return
        if (error.message !== '已取消解锁') uni.showToast({ title: error.message || '菜单锁检查失败，请重试', icon: 'none' })
        const result = { errMsg: name + ':fail ' + error.message }
        options.fail?.(result)
        options.complete?.(result)
      })
      // 同步阻止原跳转；校验通过后仅恢复这一次操作。
      return false
    } })
  }
}

function next() {
  const first = pending[0]
  secondaryLock.menuPath = first?.path || ''
  secondaryLock.token = first?.token || ''
  secondaryLock.visible = !!first
}
export function requestUnlock(path: string, token: string): Promise<void> {
  if (!path.startsWith('/') || token !== session.token) return Promise.reject(new Error('登录状态已变化，请重试'))
  // 接口再次要求验证时，撤销此前的本地解锁记录。
  unlockedPaths.delete(path)
  return new Promise((resolve, reject) => {
    pending.push({ path, token, resolve, reject })
    if (!secondaryLock.visible) next()
  })
}
export function finishUnlock() {
  const path = secondaryLock.menuPath
  const token = secondaryLock.token
  // 与服务端 30 分钟解锁期一致，提前少量过期避免边界漂移。
  if (token === session.token) unlockedPaths.set(path, Date.now() + 29 * 60 * 1000)
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].path === path && pending[i].token === token) {
      const [item] = pending.splice(i, 1)
      if (session.token === token) item.resolve()
      else item.reject(new Error('登录状态已变化，请重试'))
    }
  }
  next()
}
export function cancelUnlock() {
  for (const item of pending.splice(0)) item.reject(new Error('已取消解锁'))
  next()
}
watch(() => session.token, () => { unlockedPaths.clear(); invalidateUnlocks() }, { flush: 'sync' })
