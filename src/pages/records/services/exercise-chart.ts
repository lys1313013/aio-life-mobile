import type { ExerciseStatisticsPoint } from './exercise.ts'
import type { ChartSeries } from '../../../services/chart-options.ts'

// 对齐 Web use-echarts.ts：浅色使用 ECharts 6 的 v5 主题，深色使用 dark 主题。
const lightColors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc']
const darkColors = ['#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95']

// 每次只绘制一个自然年；历史年补齐十二个月，当年只展示到当前月。
export function exerciseMonthWindow(labels: string[], series: ChartSeries[], requestedPage = 0, now = new Date()) {
  if (!labels.length) return { labels: [], xLabels: [], series: [], year: '—', page: 0, hasOlder: false, hasNewer: false }
  const firstYear = Number(labels[0].slice(0, 4)), lastYear = Number(labels[labels.length - 1].slice(0, 4))
  const maxPage = lastYear - firstYear
  const page = Math.max(0, Math.min(maxPage, requestedPage))
  const year = lastYear - page
  const count = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const months = Array.from({ length: count }, (_, index) => year + '-' + String(index + 1).padStart(2, '0'))
  const indices = new Map(labels.map((label, index) => [label, index]))
  return {
    labels: months, xLabels: months.map(month => Number(month.slice(5)) + '月'),
    year: String(year),
    series: series.map(item => ({ ...item, values: months.map(month => {
      const index = indices.get(month)
      return index == null ? 0 : item.values[index]
    }) })),
    page, hasOlder: page < maxPage, hasNewer: page > 0,
  }
}

export function exerciseDistributionChart(points: ExerciseStatisticsPoint[], types: { id: string; dictLabel?: string; label?: string }[], dark = false) {
  const groups: Record<string, Set<string>> = Object.create(null)
  for (const point of points) {
    const type = types.find(type => type.id === point.exerciseTypeId)
    const name = type?.dictLabel || type?.label || point.exerciseTypeId
    if (!groups[name]) groups[name] = new Set()
    groups[name].add(point.exerciseDate + '_' + point.exerciseTypeId)
  }
  const colors = dark ? darkColors : lightColors
  return Object.entries(groups).map(([name, days], index) => ({ name, value: days.size, color: colors[index % colors.length] }))
}

export function exerciseMonthlyChart(points: ExerciseStatisticsPoint[], types: { id: string; dictLabel?: string; label?: string }[], dark = false) {
  const labels = [...new Set(points.map(item => item.exerciseDate.slice(0, 7)))].sort()
  const months: Record<string, Record<string, Set<string>>> = {}
  for (const item of points) {
    const type = types.find(type => type.id === item.exerciseTypeId)
    const name = type?.dictLabel || type?.label || item.exerciseTypeId
    const month = item.exerciseDate.slice(0, 7)
    if (!months[month]) months[month] = Object.create(null)
    if (!months[month][name]) months[month][name] = new Set()
    months[month][name].add(item.exerciseDate + '_' + item.exerciseTypeId)
  }
  // 与 Web monthlyStats / allTypes 相同：先按月份遇到的顺序，再按月内类型顺序分配色号。
  const categories = [...new Set(Object.values(months).flatMap(month => Object.keys(month)))]
  const colors = dark ? darkColors : lightColors
  return {
    labels,
    series: categories.map((name, index) => ({
      name,
      color: colors[index % colors.length],
      values: labels.map(month => months[month][name]?.size || 0),
    })),
  }
}
