import { watch } from 'vue'
import { session } from './session.ts'
import { homeDataRevision } from './home-refresh.ts'

// 首页多张卡片共用菜单权限数据；业务内容刷新不重复拉取同一份候选菜单。
const CACHE_TTL_MS = 60 * 1000
let snapshot: any[] | null = null
let expiresAt = 0
let revision = -1
let generation = 0
let pending: Promise<any[]> | null = null

function invalidate() {
  generation++
  snapshot = null
  expiresAt = 0
  pending = null
}
watch(() => session.token, invalidate, { flush: 'sync' })

export function loadQuickNavCandidates(fetch: (path: string) => Promise<any>): Promise<any[]> {
  const token = session.token
  const accessRevision = homeDataRevision('access')
  if (revision !== accessRevision) {
    invalidate()
    revision = accessRevision
  }
  if (!token) return Promise.reject(new Error('登录状态已变化，请重试'))
  if (snapshot !== null && Date.now() < expiresAt) return Promise.resolve(snapshot)
  if (pending) return pending
  const version = generation
  const operation = (async () => {
    const rows = await fetch('/quick-nav/candidates?client=mobile')
    if (token !== session.token || version !== generation || accessRevision !== homeDataRevision('access'))
      throw new Error('菜单权限或登录状态已变化，请重试')
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.path !== 'string'))
      throw new Error('菜单权限数据异常，请重试')
    snapshot = rows
    expiresAt = Date.now() + CACHE_TTL_MS
    return rows
  })()
  pending = operation
  // 旧请求完成后不能清掉账号或权限变化后创建的新请求。
  const clearPending = () => { if (pending === operation) pending = null }
  operation.then(clearPending, clearPending)
  return operation
}
