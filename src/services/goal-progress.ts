export function goalAchieved(item) {
  return item.currentValue != null && item.targetValue > 0 && (item.targetOperator === 'gt' ? item.currentValue > item.targetValue : item.currentValue >= item.targetValue)
}
export function goalDisplayStatus(item) {
  if (item.progressMode !== 'graphql' || !item.progressCheckedAt || item.status === 'on_hold') return item.status
  return goalAchieved(item) ? 'completed' : 'in_progress'
}
export function goalProgressPercent(item) {
  if (!(item.targetValue > 0)) return item.status === 'completed' ? 100 : 0
  const percent = Math.max(0, Math.min(100, Math.round((item.currentValue ?? 0) / item.targetValue * 100)))
  return item.targetOperator === 'gt' && !goalAchieved(item) ? Math.min(99, percent) : percent
}
export async function refreshGoalRows(rows, fetch, isCurrent = () => true) {
  const automatic = rows.filter(row => row.progressMode === 'graphql')
  const updates = new Map()
  for (let offset = 0; offset < automatic.length; offset += 10) {
    if (!isCurrent()) { const error = new Error('页面或登录状态已变化'); error.name = 'PageInactiveError'; throw error }
    const batch = automatic.slice(offset, offset + 10)
    try {
      const updated = await fetch('/goals/progress/refresh', 'POST', { ids: batch.map(row => row.id) })
      for (const row of updated) updates.set(row.id, row)
    } catch (error) {
      if (['StaleSessionError', 'PageInactiveError', 'RequestCancelledError'].includes(error.name)) throw error
      for (const row of batch) updates.set(row.id, { ...row, progressError: error.message || '进度更新失败，请重试' })
    }
  }
  if (!isCurrent()) { const error = new Error('页面或登录状态已变化'); error.name = 'PageInactiveError'; throw error }
  return rows.map(row => updates.get(row.id) || row)
}
