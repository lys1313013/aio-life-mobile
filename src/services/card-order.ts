/** ID 始终保留字符串；两个业务分包共用的轻量排序规则。 */
export function compareCardOrder(a, b, descending = false) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  const left = String(a.id), right = String(b.id)
  const order = left.length - right.length || (left < right ? -1 : left > right ? 1 : 0)
  return descending ? -order : order
}
export function previewCardMove(rows, move, descending = false) {
  const ordered = [...rows].sort((a, b) => compareCardOrder(a, b, descending))
  const from = ordered.findIndex(row => row.id === move.id)
  if (from < 0 || move.id === move.targetId || !ordered.some(row => row.id === move.targetId)) return rows
  const [item] = ordered.splice(from, 1)
  ordered.splice(ordered.findIndex(row => row.id === move.targetId) + (move.after ? 1 : 0), 0, item)
  return ordered.map((row, sortOrder) => ({ ...row, sortOrder }))
}
export function applyCardOrder(rows, ranks) {
  if (!Array.isArray(ranks)) throw Error('排序数据异常，请重试')
  const byId = new Map()
  for (const row of ranks) {
    if (typeof row?.id !== 'string' || !/^\d+$/.test(row.id) || !Number.isInteger(row.sortOrder) || row.sortOrder < 0 || byId.has(row.id)) throw Error('排序数据异常，请重试')
    byId.set(row.id, row.sortOrder)
  }
  return rows.map(row => byId.has(row.id) ? { ...row, sortOrder: byId.get(row.id) } : row)
}
