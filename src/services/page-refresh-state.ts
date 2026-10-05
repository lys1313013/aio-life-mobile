// 只记录成功写入的版本；页面数据仍由当前页面持有，不持久化到本地存储。
export const PAGE_REFRESH_INTERVAL_MS = 60 * 60 * 1000
const revisions: Record<string, number> = {}
export function pageDataSignature(keys: string[]) {
  return keys.map(key => key + ':' + (revisions[key] || 0)).join('|')
}
export function invalidatePageAfterWrite(path: string, method: string) {
  if (method === 'GET') return
  const root = path.split('?')[0].split('/')[1]
  if (root) revisions[root] = (revisions[root] || 0) + 1
}
export function createPageFreshness() {
  let snapshot: { owner: string; signature: string; at: number } | null = null
  return {
    needed(owner: string, signature: string, now = Date.now()) {
      return !snapshot || snapshot.owner !== owner || snapshot.signature !== signature
        || now - snapshot.at >= PAGE_REFRESH_INTERVAL_MS
    },
    loaded(owner: string, signature: string, now = Date.now()) { snapshot = { owner, signature, at: now } },
    clear() { snapshot = null },
  }
}
