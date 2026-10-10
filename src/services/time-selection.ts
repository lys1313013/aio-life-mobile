// 起止分钟是闭区间；固定另一端，仅允许同一连续空闲区间内的时间。
export function timeSelectionBounds(record, existing, field) {
  const anchor = field === 'startTime' ? record.endTime : record.startTime
  let min = 0, max = 1439
  for (const item of existing) {
    if ((record.id && item.id === record.id) || (item.date && item.date !== record.date)) continue
    if (item.startTime <= anchor && item.endTime >= anchor) return { min: 1, max: 0 }
    if (item.endTime < anchor) min = Math.max(min, item.endTime + 1)
    if (item.startTime > anchor) max = Math.min(max, item.startTime - 1)
  }
  return field === 'startTime' ? { min, max: Math.min(max, anchor) } : { min: Math.max(min, anchor), max }
}

export function clampTimeSelection(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// 每列独立通知来源；分钟索引是当天绝对分钟，跨小时后不读取另一列的旧索引。
export function resolveTimeWheelSelection(previous, index, field, min, max) {
  if (min > max) return previous
  const candidate = field === 'hour' ? index * 60 + previous % 60 : index
  return clampTimeSelection(candidate, min, max)
}
