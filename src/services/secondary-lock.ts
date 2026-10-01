import { reactive, watch } from 'vue'
import { session } from './session.ts'

export const secondaryLock = reactive({ menuPath: '', token: '', visible: false })
const pending: Array<{ path: string; token: string; resolve: () => void; reject: (reason: Error) => void }> = []
let navigationRevision = 0
let lifecycleInstalled = false
export function unlockNavigationRevision() { return navigationRevision }
export function invalidateUnlocks() { navigationRevision++; cancelUnlock() }
export function installUnlockLifecycle() {
  if (lifecycleInstalled) return
  lifecycleInstalled = true
  for (const name of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack']) {
    uni.addInterceptor(name, { invoke: () => { invalidateUnlocks() } })
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
  return new Promise((resolve, reject) => {
    pending.push({ path, token, resolve, reject })
    if (!secondaryLock.visible) next()
  })
}
export function finishUnlock() {
  const path = secondaryLock.menuPath
  const token = secondaryLock.token
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
watch(() => session.token, cancelUnlock)
