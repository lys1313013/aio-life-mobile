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
        shortName: category?.name || '未分类',
        startLabel: clockLabel(record.startTime),
        durationLabel: durationLabel(duration),
        label: clockLabel(record.startTime) + '  ' + durationLabel(duration),
      }
    })
  groups.sort((a, b) => b.minutes - a.minutes)
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
    recent,
    timeline: recent.map((item) => ({
      id: item.id,
      top: (item.startTime / 1440) * 100 + '%',
      height: ((item.endTime - item.startTime + 1) / 1440) * 100 + '%',
      backgroundColor: item.color,
    })),
  }
}
// 与圆环扇区使用同一顺序；每侧分别避让，最多标注六个主要分类。
export function summaryDonutLabels(groups) {
  const total = groups.reduce((sum, group) => sum + group.minutes, 0)
  if (total <= 0) return []
  const visible = [...groups].filter(group => group.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes).slice(0, 6)
  let elapsed = 0
  const labels = groups.map(group => {
    const angle = ((elapsed + group.minutes / 2) / total) * Math.PI * 2
    elapsed += group.minutes
    const right = Math.sin(angle) >= 0
    return { ...group, right, x: 88 + Math.sin(angle) * 54,
      y: 88 - Math.cos(angle) * 54, labelY: 88 - Math.cos(angle) * 72 }
  }).filter(group => visible.some(item => item.id === group.id))
  for (const right of [false, true]) {
    const side = labels.filter(label => label.right === right).sort((a, b) => a.labelY - b.labelY)
    side.forEach((label, index) => {
      label.labelY = Math.max(14, label.labelY, index ? side[index - 1].labelY + 27 : 14)
    })
    for (let index = side.length - 1; index >= 0; index--) {
      side[index].labelY = Math.min(side[index].labelY, index === side.length - 1 ? 162 : side[index + 1].labelY - 27)
    }
  }
  return labels.map(label => {
    const endX = label.right ? 143 : 33
    const bendX = label.right ? 138 : 38
    const dx = bendX - label.x, dy = label.labelY - label.y
    return { id: label.id, name: label.name, duration: durationLabel(label.minutes),
      side: label.right ? 'right' : 'left',
      position: { top: (label.labelY - 12) + 'px' },
      lines: [
        { left: label.x + 'px', top: label.y + 'px', width: Math.hypot(dx, dy) + 'px', transform: 'rotate(' + Math.atan2(dy, dx) * 180 / Math.PI + 'deg)', backgroundColor: label.color },
        { left: Math.min(bendX, endX) + 'px', top: label.labelY + 'px', width: '5px', backgroundColor: label.color },
      ],
    }
  })
}
export function webLink(path) {
  if (typeof path !== 'string') return ''
  if (path.startsWith('/') && !path.startsWith('//'))
    return 'https://aiolife.top/#' + path
  if (/^https:\/\//i.test(path)) return path
  return ''
}
