// 无平台依赖的时迹规则；接口与编辑表单的起止分钟均使用闭区间。
export function dateLabel(value) {
  return (
    value.getFullYear() +
    '-' +
    String(value.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(value.getDate()).padStart(2, '0')
  )
}
export function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function shiftDate(value, offset, mode = 'day') {
  const date = parseDate(value)
  if (mode === 'month') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, last))
  } else date.setDate(date.getDate() + offset * (mode === 'week' ? 7 : 1))
  return dateLabel(date)
}
export function periodRange(value, mode) {
  const start = parseDate(value),
    end = parseDate(value)
  if (mode === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 6)
  }
  if (mode === 'month') {
    start.setDate(1)
    end.setMonth(end.getMonth() + 1, 0)
  }
  return {
    start: dateLabel(start),
    end: dateLabel(end),
    days: Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
  }
}
export function categoryPath(id, categories) {
  const names = [],
    seen = []
  while (id && !seen.includes(id)) {
    seen.push(id)
    const category = categories.find((item) => item.id === id)
    if (!category) break
    names.unshift(category.name)
    id = category.parentId
  }
  return names.join(' / ') || '未分类'
}
export function categoryMatches(id, selected, categories) {
  if (!selected) return true
  const seen = []
  while (id && !seen.includes(id)) {
    if (id === selected) return true
    seen.push(id)
    id = categories.find((item) => item.id === id)?.parentId
  }
  return false
}
export function recordMinutes(record) {
  return Math.max(0, record.endTime - record.startTime + 1)
}
export function validateRecord(record, existing) {
  if (!record.categoryId) return '请选择分类'
  if ((record.title || '').length > 50) return '标题不能超过50个字符'
  if ((record.description || '').length > 200) return '描述不能超过200个字符'
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    dateLabel(parseDate(record.date)) !== record.date
  )
    return '请选择有效日期'
  if (
    !Number.isInteger(record.startTime) ||
    !Number.isInteger(record.endTime) ||
    record.startTime < 0 ||
    record.endTime > 1439 ||
    record.endTime < record.startTime
  )
    return '结束时间须晚于开始时间，且不能跨天'
  if (
    existing.some(
      (item) =>
        item.id !== record.id &&
        (!item.date || item.date === record.date) &&
        item.startTime <= record.endTime &&
        item.endTime >= record.startTime,
    )
  )
    return '时间段与已有记录重叠'
  if (
    (record.exercises || []).some(
      (item) =>
        !item.exerciseTypeId ||
        (item.exerciseCount != null &&
          (!Number.isFinite(Number(item.exerciseCount)) ||
            Number(item.exerciseCount) < 0)),
    )
  )
    return '请填写有效的运动类型和数量'
  return ''
}
export function clockMinutes(value) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}
export function categoryStats(records, categories) {
  const groups = []
  for (const record of records) {
    let group = groups.find((item) => item.id === record.categoryId)
    if (!group) {
      const category = categories.find((item) => item.id === record.categoryId)
      group = {
        id: record.categoryId,
        name: categoryPath(record.categoryId, categories),
        color: category?.color || '#94a3b8',
        minutes: 0,
      }
      groups.push(group)
    }
    group.minutes += recordMinutes(record)
  }
  return groups.sort((a, b) => b.minutes - a.minutes)
}

// 与 Web 时间表单一致：快捷调整停在相邻记录外，允许同一分钟表示 1m。
export function adjustRecordTime(record, existing, field, delta) {
  const others = existing.filter(
    (r) => r.id !== record.id && (!r.date || r.date === record.date),
  )
  if (field === 'startTime') {
    const before = others.filter((r) => r.endTime <= record.startTime)
    const min = before.length
      ? Math.max(...before.map((r) => r.endTime)) + 1
      : 0
    if (min > record.endTime) return record.startTime
    return Math.max(min, Math.min(record.endTime, record.startTime + delta))
  }
  const after = others.filter((r) => r.startTime >= record.endTime)
  const max = after.length
    ? Math.min(...after.map((r) => r.startTime)) - 1
    : 1439
  if (max < record.startTime) return record.endTime
  return Math.max(record.startTime, Math.min(max, record.endTime + delta))
}
export function durationEnd(record, existing, minutes) {
  const after = existing.filter(
    (r) =>
      r.id !== record.id &&
      (!r.date || r.date === record.date) &&
      r.startTime >= record.startTime,
  )
  const max = after.length
    ? Math.min(...after.map((r) => r.startTime)) - 1
    : 1439
  if (max < record.startTime) return record.endTime
  return Math.max(
    record.startTime,
    Math.min(max, record.startTime + Math.max(1, minutes) - 1),
  )
}
export function elapsedSinceRecord(records, nowMinutes) {
  if (!records.length) return null
  const last = [...records].sort((a, b) => b.startTime - a.startTime)[0]
  return Math.max(0, nowMinutes - last.endTime - 1)
}

export function matchesCategories(id, selected, categories) {
  return (
    selected.length === 0 ||
    selected.some((value) => categoryMatches(id, value, categories))
  )
}

// 默认归并一级分类；筛选后显示明细，父子同时选中只统计一次。
export function distributionStats(records, categories, selected = []) {
  const projected = records
    .filter((r) => matchesCategories(r.categoryId, selected, categories))
    .map((r) => {
      let id = r.categoryId
      const seen = []
      while (selected.length === 0 && !seen.includes(id)) {
        seen.push(id)
        const parent = categories.find(
          (c) => c.id === categories.find((c) => c.id === id)?.parentId,
        )
        if (!parent) break
        id = parent.id
      }
      return { ...r, categoryId: id }
    })
  return categoryStats(projected, categories)
}

export function trendPeriods(date, mode) {
  // 从周期首日移动，避免 31 日经短月连续夹紧导致边界漂移。
  const anchor = periodRange(date, mode).start
  return Array.from({ length: 10 }, (_, index) =>
    periodRange(shiftDate(anchor, index - 9, mode), mode),
  )
}

export function periodStatistics(
  records,
  categories,
  selected,
  periods,
  average = false,
) {
  return periods.map((period) => {
    const all = records.filter(
      (r) => r.date >= period.start && r.date <= period.end,
    )
    const divisor = average
      ? Math.max(1, new Set(all.map((r) => r.date)).size)
      : 1
    const segments = distributionStats(all, categories, selected).map(
      (item) => ({ ...item, minutes: item.minutes / divisor }),
    )
    return {
      ...period,
      segments,
      minutes: segments.reduce((sum, item) => sum + item.minutes, 0),
    }
  })
}
