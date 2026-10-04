import { watch } from 'vue'
import { session } from './session.ts'
import { clearLifeCatalogCache } from './life-catalog-cache.ts'

// 仅保存在当前登录的内存中，配置最多复用 12 小时；不延长密码解锁有效期。
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
type MenuAccess = { ids: string[]; menus: any[] }
let snapshot: MenuAccess | null = null
let expiresAt = 0
let generation = 0
let pending: Promise<MenuAccess> | null = null

export function invalidateMenuAccessCache() {
  generation++
  snapshot = null
  expiresAt = 0
  pending = null
}

watch(() => session.token, invalidateMenuAccessCache, { flush: 'sync' })

export function cachedMenuAccess(): MenuAccess | null {
  return session.token && Date.now() < expiresAt ? snapshot : null
}

export function invalidateMenuAccessAfterWrite(path: string, method: string) {
  if (method === 'GET') return
  path = path.split('?')[0]
  if (path === '/menu/preferences' || path === '/menu/admin' || path.startsWith('/menu/admin/')) clearLifeCatalogCache()
  if (['/auth/secondary-lock/menus', '/auth/secondary-password', '/auth/reset-secondary-password'].includes(path)
    || path === '/menu/admin' || path.startsWith('/menu/admin/')) invalidateMenuAccessCache()
}

export function loadMenuAccess(fetch: (path: string) => Promise<any>): Promise<MenuAccess> {
  const cached = cachedMenuAccess()
  if (cached) return Promise.resolve(cached)
  if (pending) return pending
  const token = session.token
  const version = generation
  const current = () => !!token && token === session.token && version === generation
  const operation = (async () => {
    if (!current()) throw new Error('登录状态已变化，请重试')
    const ids = await fetch('/auth/secondary-lock/menus')
    if (!current()) throw new Error('菜单锁配置已变化，请重试')
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error('菜单锁数据异常，请重试')
    const menus = ids.length ? await fetch('/menu/all?client=mobile') : []
    if (!current()) throw new Error('菜单锁配置已变化，请重试')
    function validateTree(nodes: any[]) {
      if (!Array.isArray(nodes)) throw new Error('菜单锁数据异常，请重试')
      for (const node of nodes) {
        if (!node || typeof node !== 'object') throw new Error('菜单锁数据异常，请重试')
        if (node.children != null) validateTree(node.children)
      }
    }
    validateTree(menus)
    snapshot = { ids, menus }
    expiresAt = Date.now() + CACHE_TTL_MS
    return snapshot
  })()
  pending = operation
  // 失效后可能已有新请求；旧请求完成时不能清除新请求。
  const clearPending = () => { if (pending === operation) pending = null }
  operation.then(clearPending, clearPending)
  return operation
}
