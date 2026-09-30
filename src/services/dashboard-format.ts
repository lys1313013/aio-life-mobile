// 纯数据计算，不依赖浏览器；与后端时迹的闭区间分钟约定一致。
export function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return (
    (hours > 0 ? hours + 'h' : '') + (rest > 0 || hours === 0 ? rest + 'm' : '')
  )
}
export function clockLabel(minutes) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' +
    String(minutes % 60).padStart(2, '0')
  )
}
export function timeSummary(categories, records) {
  const groups = []
  let total = 0
  const recent = [...records]
    .sort((a, b) => b.startTime - a.startTime)
    .map((record) => {
      const category = categories.find((item) => item.id === record.categoryId)
      const parent = categories.find((item) => item.id === category?.parentId)
      const root = parent || category
      const duration = Math.max(0, record.endTime - record.startTime + 1)
      const key = root?.id || record.categoryId
      let group = groups.find((item) => item.id === key)
      if (!group) {
        group = {
          id: key,
          name: root?.name || '未分类',
          color: root?.color || '#94a3b8',
          minutes: 0,
        }
        groups.push(group)
      }
      group.minutes += duration
      total += duration
      return {
        ...record,
        color: category?.color || '#94a3b8',
        name:
          (parent ? parent.name + ' / ' : '') + (category?.name || '未分类'),
        label: clockLabel(record.startTime) + '  ' + durationLabel(duration),
      }
    })
  const segments = []
  for (let index = 0; index < 120 && total > 0; index++) {
    const point = ((index + 0.5) / 120) * total
    let end = 0
    const group = groups.find((item) => {
      end += item.minutes
      return point <= end
    })
    segments.push({
      transform: 'rotate(' + index * 3 + 'deg)',
      backgroundColor: group?.color || '#94a3b8',
    })
  }
  return {
    total: durationLabel(total),
    groups,
    segments,
    recent: recent.slice(0, 6),
    timeline: recent.map((item) => ({
      id: item.id,
      top: (item.startTime / 1440) * 100 + '%',
      height: ((item.endTime - item.startTime + 1) / 1440) * 100 + '%',
      backgroundColor: item.color,
    })),
  }
}
export function webLink(path) {
  if (typeof path !== 'string') return ''
  if (path.startsWith('/') && !path.startsWith('//'))
    return 'https://aiolife.top/#' + path
  if (/^https:\/\//i.test(path)) return path
  return ''
}
