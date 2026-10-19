import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function moduleAt(path) {
  const result = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { exerciseMonthlyChart, exerciseDistributionChart, exerciseMonthWindow } = await moduleAt('../src/pages/records/services/exercise-chart.ts')
const { buildChartOption, layoutStackedBarLabels, pieSectorAt } = await moduleAt('../src/services/chart-options.ts')

test('月图每次最多六个自然月，跨年补零且分页边界不丢失类型颜色', () => {
  const labels = ['2024-11', '2025-01', '2025-07']
  const series = [{ name: '散步', color: '#5470c6', values: [2, 3, 5] }]
  const latest = exerciseMonthWindow(labels, series)
  assert.deepEqual(latest.labels, ['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'])
  assert.deepEqual(latest.xLabels, ['2月', '3月', '4月', '5月', '6月', '7月'])
  assert.deepEqual(latest.series[0].values, [0, 0, 0, 0, 0, 5])
  assert.equal(latest.hasOlder, true)
  assert.equal(latest.hasNewer, false)
  const older = exerciseMonthWindow(labels, series, 1)
  assert.deepEqual(older.labels, ['2024-11', '2024-12', '2025-01'])
  assert.deepEqual(older.series[0].values, [2, 0, 3])
  assert.equal(older.year, '2024–2025')
  assert.equal(older.series[0].color, latest.series[0].color)
  assert.equal(older.hasOlder, false)
  assert.equal(older.hasNewer, true)
  assert.equal(exerciseMonthWindow(labels, series, 99).page, 1)
  assert.equal(exerciseMonthWindow(labels, series, -1).page, 0)
  assert.deepEqual(exerciseMonthWindow([], []).labels, [])
  assert.deepEqual(exerciseMonthWindow(['2026-10'], [{ name: '散步', values: [1] }]).series[0].values, [1])
})

test('饼图按运动日与类型统计，配色及类型顺序与 Web 一致', () => {
  const points = [
    { exerciseTypeId: '82', exerciseDate: '2026-10-01', exerciseCount: 100, recordCount: 3 },
    { exerciseTypeId: '81', exerciseDate: '2026-10-01', exerciseCount: 50, recordCount: 2 },
    { exerciseTypeId: '82', exerciseDate: '2026-10-01', exerciseCount: 100, recordCount: 3 },
    { exerciseTypeId: '82', exerciseDate: '2026-10-02', exerciseCount: 50, recordCount: 1 },
  ]
  const types = [{ id: '81', dictLabel: '散步' }, { id: '82', dictLabel: '深蹲' }]
  assert.deepEqual(exerciseDistributionChart(points, types), [
    { name: '深蹲', value: 2, color: '#5470c6' }, { name: '散步', value: 1, color: '#91cc75' },
  ])
  assert.equal(exerciseDistributionChart(points, types, true)[0].color, '#5070dd')
  assert.deepEqual(exerciseDistributionChart([], types), [])
})

test('饼图触摸命中真实扇区，环内留白、外部和零角度不能误选', () => {
  const shape = { cx: 100, cy: 100, r: 80, r0: 30, clockwise: true }
  const sectors = [
    { ...shape, startAngle: -Math.PI / 2, endAngle: 0 },
    { ...shape, startAngle: 0, endAngle: Math.PI * 1.5 },
  ]
  assert.equal(pieSectorAt(sectors, 150, 50), 0)
  assert.equal(pieSectorAt(sectors, 50, 100), 1)
  assert.equal(pieSectorAt(sectors, 100, 100), -1)
  assert.equal(pieSectorAt(sectors, 200, 100), -1)
  assert.equal(pieSectorAt([{ ...shape, startAngle: 0, endAngle: 0 }], 150, 100), -1)
  assert.equal(pieSectorAt([{ ...shape, startAngle: -Math.PI / 2, endAngle: Math.PI * 1.5 }], 150, 100), 0)
})

test('月度分类型按运动日去重，保留跨年顺序、Web 类型顺序和字符串 ID', () => {
  const id = '9223372036854775807'
  const types = [{ id, dictLabel: '散步', color: '#5470c6' }, { id: '82', dictLabel: '深蹲' }]
  const points = [
    { exerciseTypeId: id, exerciseDate: '2026-01-03', exerciseCount: 999, recordCount: 5 },
    { exerciseTypeId: id, exerciseDate: '2026-01-03', exerciseCount: 200, recordCount: 1 },
    { exerciseTypeId: id, exerciseDate: '2026-01-04', exerciseCount: 0, recordCount: 1 },
    { exerciseTypeId: '82', exerciseDate: '2025-12-31', exerciseCount: 10, recordCount: 1 },
    { exerciseTypeId: 'deleted', exerciseDate: '2026-01-01', exerciseCount: 2, recordCount: 1 },
  ]
  const result = exerciseMonthlyChart(points, types)
  assert.deepEqual(result.labels, ['2025-12', '2026-01'])
  assert.deepEqual(result.series.map(item => item.values), [[0, 2], [0, 1], [1, 0]])
  assert.deepEqual(result.series.map(item => item.name), ['散步', 'deleted', '深蹲'])
  assert.equal(result.series[0].color, '#5470c6')
  assert.deepEqual(result.series.map(item => item.color), ['#5470c6', '#91cc75', '#fac858'])
  assert.deepEqual(exerciseMonthlyChart(points, types, true).series.map(item => item.color), ['#5070dd', '#b6d634', '#505372'])
  assert.equal(exerciseMonthlyChart(points.filter(item => item.exerciseTypeId === '82'), types).series[0].color, '#5470c6')
  assert.deepEqual(exerciseMonthlyChart([], types), { labels: [], series: [] })
})

test('堆叠共用基线、整数刻度和直角宽柱，不改变普通图表', () => {
  const settings = { dark: false, kind: 'bar', selected: 0, selectionActive: false, showScale: true, width: 300 }
  const series = [{ name: '散步', values: [3] }, { name: '深蹲', values: [2] }]
  const stacked = buildChartOption(['2026-01'], series, { ...settings, stacked: true })
  assert.deepEqual(stacked.series.map(item => item.stack), ['total', 'total'])
  assert.equal(stacked.series[0].barWidth, '72%')
  assert.equal(stacked.series[0].data[0].itemStyle.borderRadius, undefined)
  assert.equal(stacked.yAxis.minInterval, 1)
  assert.equal(buildChartOption(['2026-01'], series, settings).series[0].stack, undefined)
})

test('分段标签按实际色块尺寸避让，薄色块参与合计、零值不显示', () => {
  const result = layoutStackedBarLabels([
    { name: '散步', color: '#5470c6', points: [{ value: 8, bar: { x: 30, y: 200, width: 30, height: -80 } }] },
    { name: '深蹲', color: '#b8d82d', points: [{ value: 1, bar: { x: 30, y: 120, width: 30, height: -10 } }] },
    { name: '俯卧撑', color: '#8061b0', points: [{ value: 0, bar: { x: 30, y: 110, width: 30, height: 0 } }] },
  ], 300, 20)
  assert.deepEqual(result.segments.map(item => item.text), ['8'])
  assert.equal(result.segments[0].top, 153)
  assert.equal(result.totals[0].text, '9')
  assert.equal(result.totals[0].top, 92)
  assert.deepEqual(layoutStackedBarLabels([], 300, 20), { segments: [], totals: [] })
})
