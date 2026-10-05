// Small shared preference controller: no platform/UI dependencies, usable by home and settings.
export function homeCardState() {
  return { items: [], ready: false, loading: false, error: '', busy: '' }
}
export function createHomeCardPreferences(state, fetch, identity) {
  let generation = 0, pending = null
  function clear() {
    generation++; pending = null
    Object.assign(state, homeCardState())
  }
  function current(version, owner) { return version === generation && owner === identity() }
  async function load() {
    if (pending) return pending
    if (state.busy) return
    const version = ++generation, owner = identity()
    state.loading = true; state.error = ''
    const task = (async () => {
      try {
        const items = await fetch('/home/cards', 'GET')
        if (current(version, owner)) { state.items = items; state.ready = true }
      } catch (error) {
        if (current(version, owner)) state.error = error.message || '加载失败，请重试'
      } finally {
        if (current(version, owner)) { state.loading = false; pending = null }
      }
    })()
    pending = task
    return task
  }
  async function mutate(key, path, method, body = null, optimisticItems = null) {
    if (!state.ready || state.loading || state.busy) return false
    const version = ++generation, owner = identity()
    const previousItems = state.items
    state.busy = key
    try {
      if (optimisticItems) state.items = optimisticItems
      const items = await fetch(path, method, body)
      if (!current(version, owner)) return false
      state.items = items
      return true
    } catch (error) {
      if (optimisticItems && current(version, owner)) state.items = previousItems
      throw error
    } finally { if (current(version, owner)) state.busy = '' }
  }
  async function reorder(group, keys) {
    if (!state.ready || state.loading || state.busy) return false
    const rows = state.items.filter(item => item.group === group)
    const byKey = new Map(rows.map(item => [item.cardKey, item]))
    if (keys.length !== rows.length || new Set(keys).size !== keys.length || keys.some(key => !byKey.has(key))) {
      throw new Error('卡片列表已变化，请重试')
    }
    const ordered = keys.map((key, sortOrder) => ({ ...byKey.get(key), sortOrder }))
    let index = 0
    const optimisticItems = state.items.map(item => item.group === group ? ordered[index++] : item)
    return mutate(group, '/home/cards/order', 'PUT', { group, keys }, optimisticItems)
  }
  return {
    clear, load,
    enabled: key => state.ready && state.items.some(item => item.cardKey === key && item.enabled),
    order: key => state.items.find(item => item.cardKey === key)?.sortOrder ?? 9999,
    toggle: (key, enabled) => mutate(key, '/home/cards/' + encodeURIComponent(key), 'PUT', { enabled }),
    reorder,
    reset: () => mutate('reset', '/home/cards', 'DELETE'),
  }
}
export function moveHomeCard(items, from, to) {
  const copy = [...items]
  if (from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy
  copy.splice(to, 0, copy.splice(from, 1)[0])
  return copy
}
