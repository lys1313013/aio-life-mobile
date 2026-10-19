import spacing from '../styles/spacing.json'
import typography from '../styles/typography.json'

export type ChartSeries = { name: string; color?: string; values: number[] }
export const chartHeight = 228 // Canvas geometry, including axes.
const palette = ['#427bea', '#e05260', '#20a574', '#e7a638', '#9560c6']

export function colorChartSeries(series: ChartSeries[]) {
  return series.map((item, index) => ({ ...item,
    color: /^#[\da-f]{6}$/i.test(item.color || '') ? item.color! : palette[index % palette.length],
  }))
}
export function validateChartData(labels: string[], series: ChartSeries[]) {
  for (const item of series) {
    if (!Array.isArray(item.values) || item.values.length !== labels.length || item.values.some(value => !Number.isFinite(value))) {
      throw new Error('图表数据与标签不一致')
    }
  }
}
export function chartAxisLabel(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 100000000) return Number((value / 100000000).toFixed(1)) + '亿'
  if (magnitude >= 10000) return Number((value / 10000).toFixed(1)) + '万'
  return String(Number(value.toFixed(4)))
}
// Reserve both endpoint labels before filling the axis with labels that fit.
export function layoutChartAxisLabels(labels: string[], points: number[], width: number, labelWidths: number[]) {
  const candidates = labels.flatMap((label, index) => {
    const x = points[index]
    if (!Number.isFinite(x)) return []
    const labelWidth = Math.min(width, Math.ceil(labelWidths[index] ?? label.length * typography.roles.caption.size))
    return [{ label, index, left: Math.max(0, Math.min(width - labelWidth, x - labelWidth / 2)), width: labelWidth }]
  })
  if (candidates.length <= 1) return candidates
  const last = candidates[candidates.length - 1]
  const visible = [candidates[0]]
  for (const item of candidates.slice(1, -1)) {
    const previous = visible[visible.length - 1]
    if (item.left >= previous.left + previous.width + spacing.detail && item.left + item.width + spacing.detail <= last.left) visible.push(item)
  }
  if (last.left >= visible[visible.length - 1].left + visible[visible.length - 1].width + spacing.detail) visible.push(last)
  return visible
}

// 使用引擎实际绘制的色块尺寸，窄柱和薄色块不强塞标签。
export function layoutStackedBarLabels(series: any[], width: number, left: number) {
  const segments: any[] = [], totals: any[] = []
  const line = typography.roles['chart-label'].lineHeight
  const count = Math.max(0, ...series.map(item => item.points.length))
  for (let index = 0; index < count; index++) {
    let total = 0, top = Infinity, center = 0, barWidth = 0
    for (const item of series) {
      const point = item.points[index], bar = point?.bar
      if (!bar || point.value <= 0 || !Number.isFinite(bar.y)) continue
      const barTop = Math.min(bar.y, bar.y + bar.height)
      total += point.value
      top = Math.min(top, barTop)
      center = bar.x + bar.width / 2
      barWidth = Math.abs(bar.width)
      const text = String(point.value)
      if (Math.abs(bar.height) < line + spacing.micro || barWidth < text.length * typography.roles['chart-label'].size * 0.6 + spacing.detail) continue
      const rgb = item.color.slice(1).match(/.{2}/g).map(value => parseInt(value, 16))
      const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
      segments.push({ key: item.name + index, text, left: bar.x, width: barWidth,
        top: barTop + (Math.abs(bar.height) - line) / 2, color: brightness > 160 ? '#202124' : '#ffffff' })
    }
    if (total > 0) {
      const text = String(total), labelWidth = Math.min(width - left, Math.max(barWidth, text.length * typography.roles['chart-label'].size))
      totals.push({ key: index, text, width: labelWidth,
        left: Math.max(left, Math.min(width - labelWidth, center - labelWidth / 2)), top: Math.max(0, top - line - spacing.detail) })
    }
  }
  return { segments, totals }
}
export function buildChartOption(labels: string[], series: ChartSeries[], settings: {
  dark: boolean; kind: string; selected: number; selectionActive: boolean; showScale: boolean; width: number; roundedBars?: boolean; stacked?: boolean
}) {
  validateChartData(labels, series)
  const axisColor = settings.dark ? '#737985' : '#c9cdd5'
  const gridColor = settings.dark ? '#34373d' : '#e8eaef'
  return {
    animation: false,
    textStyle: { fontFamily: typography.families.canvas, fontSize: typography.roles.caption.size },
    // ChartCanvas measures the actual formatted Y ticks before flushing the canvas.
    grid: { left: spacing.detail, right: spacing.inline,
      top: settings.roundedBars || settings.stacked ? typography.roles['chart-label'].lineHeight * 2 + spacing.inline : spacing.section,
      bottom: typography.roles.caption.lineHeight + spacing.section },
    xAxis: {
      type: 'category', data: labels, boundaryGap: settings.kind === 'bar',
      axisLine: { show: true, onZero: false, lineStyle: { color: axisColor } },
      axisTick: { show: false }, axisLabel: { show: false },
    },
    yAxis: {
      type: 'value', splitNumber: 4,
      ...(settings.stacked ? { min: 0, minInterval: 1 } : {}),
      axisLine: { show: settings.showScale, lineStyle: { color: axisColor } },
      axisTick: { show: false }, axisLabel: { show: false },
      splitLine: { show: settings.showScale, lineStyle: { color: gridColor, width: spacing.hairline, ...(settings.stacked ? { type: 'dashed' } : {}) } },
    },
    series: series.map(item => ({
      name: item.name, type: settings.kind === 'bar' ? 'bar' : 'line',
      ...(settings.stacked ? { stack: 'total', barWidth: '72%' } : {}),
      data: item.values.map((value, index) => ({ value,
        symbolSize: settings.selectionActive && index === settings.selected ? 6 : 4,
        itemStyle: {
          opacity: settings.kind === 'bar' && settings.selectionActive && index !== settings.selected ? 0.45 : 1,
          ...(settings.roundedBars ? { borderRadius: value < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0] } : {}),
        },
      })),
      itemStyle: { color: item.color }, lineStyle: { width: 2, color: item.color },
      showSymbol: labels.length <= 18, symbol: 'circle', smooth: false,
      clip: true, emphasis: { disabled: true },
      barMaxWidth: settings.stacked ? 64 : settings.roundedBars ? 32 : 24,
      ...(settings.roundedBars ? { barWidth: '50%' } : {}),
    })),
  }
}

// 命中环形扇区时排除中心留白，并处理跨越零度的起止角度。
export function pieSectorAt(sectors: any[], x: number, y: number) {
  const circle = Math.PI * 2
  const normalize = (angle: number) => (angle % circle + circle) % circle
  return sectors.findIndex(sector => {
    if (!sector || !Number.isFinite(sector.startAngle) || sector.endAngle === sector.startAngle) return false
    const dx = x - sector.cx, dy = y - sector.cy, radius = Math.hypot(dx, dy)
    if (radius < sector.r0 || radius > sector.r) return false
    const angle = Math.atan2(dy, dx)
    const offset = normalize(sector.clockwise === false ? sector.startAngle - angle : angle - sector.startAngle)
    return offset <= Math.abs(sector.endAngle - sector.startAngle) + 0.000001
  })
}

// Each instance owns its canvas context; no global override can steal another chart.
export function createChartSurface(context: any) {
  const node = context.canvas
  return {
    getContext: () => context,
    get width() { return node.width },
    set width(value) { node.width = value },
    get height() { return node.height },
    set height(value) { node.height = value },
  }
}
