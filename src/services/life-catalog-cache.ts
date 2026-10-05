import { watch } from 'vue'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { session } from './session.ts'

const storageKey = 'aio-life-mobile.life-catalog.v2'
// 目录先展示缓存，超过 60 分钟再后台校验；只保存登录指纹。
const REFRESH_INTERVAL_MS = 60 * 60 * 1000
let snapshot: any[] | null = null
let updatedAt = 0
let revision = 0
export function lifeCatalogRevision() { return revision }
export function lifeCatalogNeedsRefresh() {
  return readCachedLifeCatalog() === null || !updatedAt || Date.now() - updatedAt >= REFRESH_INTERVAL_MS
}
function owner() {
  // 固定 UTF-16 字节序生成指纹，兼容没有 TextEncoder 的小程序。
  const bytes = new Uint8Array(session.token.length * 2)
  for (let i = 0; i < session.token.length; i++) {
    const code = session.token.charCodeAt(i)
    bytes[i * 2] = code >>> 8
    bytes[i * 2 + 1] = code & 255
  }
  return bytesToHex(sha256(bytes))
}

export function clearLifeCatalogCache() {
  snapshot = null
  updatedAt = 0
  revision++
  try {
    uni.removeStorageSync(storageKey)
  } catch (_) {
    try { uni.setStorageSync(storageKey, '') } catch (_) { /* 存储不可用时仍清理内存 */ }
  }
}

watch(() => session.token, (token, previous) => {
  snapshot = null
  updatedAt = 0
  // 启动时从空状态恢复 Token，保留本地缓存供指纹校验。
  if (previous || !token) clearLifeCatalogCache()
}, { flush: 'sync' })

function validCatalog(data: any): data is any[] {
  return Array.isArray(data) && data.every(item =>
    item && typeof item.menuId === 'string' && typeof item.title === 'string' &&
    typeof item.path === 'string' && item.path.startsWith('/') &&
    !item.path.startsWith('//') && !/[\\\s?#]/.test(item.path) &&
    typeof item.parentTitle === 'string' && Array.isArray(item.ancestors) &&
    item.ancestors.every(parent => parent && typeof parent.menuId === 'string' && typeof parent.title === 'string'))
}

export function readCachedLifeCatalog() {
  if (!session.token) return null
  if (snapshot !== null) return snapshot
  try {
    const stored = uni.getStorageSync(storageKey)
    if (stored && stored.owner === owner() && validCatalog(stored.catalog)) {
      snapshot = stored.catalog
      updatedAt = typeof stored.updatedAt === 'number' && stored.updatedAt <= Date.now() ? stored.updatedAt : 0
    }
  } catch (_) { /* 读取失败或损坏时由页面重新请求 */ }
  return snapshot
}

export function cacheLifeCatalog(data: any[], token: string, expectedRevision = revision) {
  if (!token || token !== session.token || expectedRevision !== revision) return
  snapshot = data
  updatedAt = Date.now()
  try {
    uni.setStorageSync(storageKey, { owner: owner(), catalog: data, updatedAt })
  } catch (_) { /* 本地存储不可用时继续使用内存缓存 */ }
}
