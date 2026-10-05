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
export function buildChartOption(labels: string[], series: ChartSeries[], settings: {
  dark: boolean; kind: string; selected: number; selectionActive: boolean; showScale: boolean; width: number
}) {
  validateChartData(labels, series)
  const axisColor = settings.dark ? '#737985' : '#c9cdd5'
  const gridColor = settings.dark ? '#34373d' : '#e8eaef'
  return {
    animation: false,
    textStyle: { fontFamily: typography.families.canvas, fontSize: typography.roles.caption.size },
    // ChartCanvas measures the actual formatted Y ticks before flushing the canvas.
    grid: { left: spacing.detail, right: spacing.inline, top: spacing.section, bottom: typography.roles.caption.lineHeight + spacing.section },
    xAxis: {
      type: 'category', data: labels, boundaryGap: settings.kind === 'bar',
      axisLine: { show: true, onZero: false, lineStyle: { color: axisColor } },
      axisTick: { show: false }, axisLabel: { show: false },
    },
    yAxis: {
      type: 'value', splitNumber: 4,
      axisLine: { show: settings.showScale, lineStyle: { color: axisColor } },
      axisTick: { show: false }, axisLabel: { show: false },
      splitLine: { show: settings.showScale, lineStyle: { color: gridColor, width: spacing.hairline } },
    },
    series: series.map(item => ({
      name: item.name, type: settings.kind === 'bar' ? 'bar' : 'line',
      data: item.values.map((value, index) => ({ value,
        symbolSize: settings.selectionActive && index === settings.selected ? 6 : 4,
        itemStyle: { opacity: settings.kind === 'bar' && settings.selectionActive && index !== settings.selected ? 0.45 : 1 },
      })),
      itemStyle: { color: item.color }, lineStyle: { width: 2, color: item.color },
      showSymbol: labels.length <= 18, symbol: 'circle', smooth: false,
      clip: true, emphasis: { disabled: true },
      barMaxWidth: 24,
    })),
  }
}

// Plain canvas surface avoids DOM/event assumptions in ECharts on every platform.
// Each instance owns its context; no global createCanvas override can steal another chart.
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
