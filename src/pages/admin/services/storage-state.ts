// 游标属于当前前缀；失败不推进游标，刷新不提前清空已显示内容。
export function storageBrowserState() {
  return { bucket: '', prefix: '', items: [], nextCursor: null, loading: false, loadingMore: false, error: '', moreError: '', loaded: false }
}

export function readStoragePage(data) {
  if (!data || typeof data.bucket !== 'string' || typeof data.prefix !== 'string' || !Array.isArray(data.items) || (data.nextCursor != null && typeof data.nextCursor !== 'string')) throw Error('对象存储数据异常')
  for (const item of data.items) {
    if (!item || typeof item.key !== 'string' || !item.key || typeof item.directory !== 'boolean' || typeof item.previewable !== 'boolean' || !/^(0|[1-9]\d*)$/.test(String(item.size)) || (typeof item.size !== 'string' && typeof item.size !== 'number') || (item.lastModified != null && typeof item.lastModified !== 'string')) throw Error('对象存储文件数据异常')
  }
  return data
}

export function createStorageBrowser(query, state, allowed = () => true) {
  let version = 0, active = true, attemptedPrefix = ''
  const deleted = new Map()
  let deletionVersion = 0
  async function load(prefix = state.prefix, more = false) {
    if (!active || !allowed() || (more && (state.loading || state.loadingMore || state.error || !state.nextCursor))) return
    const revision = ++version, cursor = more ? state.nextCursor : null, deletionAtStart = deletionVersion
    attemptedPrefix = prefix
    state.loading = !more
    state.loadingMore = more
    state.error = ''
    state.moreError = ''
    try {
      const data = readStoragePage(await query({ prefix, cursor: cursor || undefined, pageSize: 24 }))
      if (!active || revision !== version || !allowed()) return
      if (data.prefix !== prefix) throw Error('对象存储路径不匹配，请重试')
      const incoming = data.items.filter(item => (deleted.get(item.key) || 0) <= deletionAtStart)
      const entries = new Map((more ? state.items : []).map(item => [item.key, item]))
      incoming.forEach(item => entries.set(item.key, item))
      state.bucket = data.bucket
      state.prefix = data.prefix
      state.items = [...entries.values()]
      state.nextCursor = data.items.length && data.nextCursor !== cursor ? data.nextCursor || null : null
      state.loaded = true
    } catch (reason) {
      if (active && revision === version && allowed()) state[more ? 'moreError' : 'error'] = reason instanceof Error ? reason.message : '读取失败，请重试'
    } finally {
      if (revision === version) { state.loading = false; state.loadingMore = false }
    }
  }
  return {
    load,
    more: () => state.moreError ? Promise.resolve() : load(state.prefix, true),
    retryMore: () => load(state.prefix, true),
    retry: () => load(attemptedPrefix),
    remove(key) { deleted.set(key, ++deletionVersion); state.items = state.items.filter(item => item.key !== key) },
    pause() { active = false; version++; state.loading = false; state.loadingMore = false },
    resume() { active = true },
  }
}

export function storageBreadcrumbs(prefix) {
  const parts = []
  for (let index = 0; index < prefix.length; index++) {
    if (prefix[index] === '/') parts.push({ label: prefix.slice(0, index).split('/').pop() || '/', prefix: prefix.slice(0, index + 1) })
  }
  return parts
}

export function storageObjectName(key, prefix) {
  return key.slice(prefix.lastIndexOf('/') + 1) || key
}

export function storageSize(value) {
  const bytes = Number(value)
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}
