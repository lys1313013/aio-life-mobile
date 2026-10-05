import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'

const bundle = await build({ entryPoints: [new URL('../src/services/chart-options.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' })
const { buildChartOption, chartAxisLabel, colorChartSeries, createChartSurface, layoutChartAxisLabels } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const settings = { dark: false, kind: 'line', selected: 1, selectionActive: true, showScale: true, width: 300 }

test('公共 ECharts 配置保留负值、单点和全零，非法数据不能被画成零', () => {
  const series = colorChartSeries([{ name: '结余', values: [-20, 40] }])
  const option = buildChartOption(['一月', '二月'], series, settings)
  assert.deepEqual(option.series[0].data.map(row => row.value), [-20, 40])
  assert.equal(option.yAxis.axisLine.show, true)
  assert.equal(option.yAxis.splitLine.show, true)
  assert.equal(option.xAxis.boundaryGap, false)
  assert.equal(option.series[0].data[1].symbolSize, 6)
  assert.deepEqual(buildChartOption(['一月'], [{ name: '收入', values: [0] }], settings).series[0].data.map(row => row.value), [0])
  assert.throws(() => buildChartOption(['一月'], [{ name: '收入', values: [1, 2] }], settings), /不一致/)
  assert.throws(() => buildChartOption(['一月'], [{ name: '收入', values: [NaN] }], settings), /不一致/)
})
test('大金额和小数刻度保持符号，暗色网格与显隐采用同一配置', () => {
  assert.equal(chartAxisLabel(-25000), '-2.5万')
  assert.equal(chartAxisLabel(0.0001), '0.0001')
  assert.equal(chartAxisLabel(0), '0')
  const option = buildChartOption(['一月'], [{ name: '收入', values: [10], color: '#427bea' }], { ...settings, dark: true, kind: 'bar', showScale: false })
  assert.equal(option.yAxis.axisLine.show, false)
  assert.equal(option.xAxis.boundaryGap, true)
  assert.equal(option.series[0].itemStyle.color, '#427bea')
  assert.notEqual(option.xAxis.axisLine.lineStyle.color, buildChartOption(['一月'], [], settings).xAxis.axisLine.lineStyle.color)
})
test('每张图表拥有独立画布和分辨率，不能全局覆盖另一张图的 context', () => {
  const a = { canvas: { width: 100, height: 100 } }, b = { canvas: { width: 200, height: 200 } }
  const first = createChartSurface(a), second = createChartSurface(b)
  first.width = 600; first.height = 456
  assert.equal(first.getContext(), a)
  assert.equal(second.getContext(), b)
  assert.deepEqual(a.canvas, { width: 600, height: 456 })
  assert.deepEqual(b.canvas, { width: 200, height: 200 })
})
test('微信图表引擎并发加载去重，加载失败后可以重试', async () => {
  const source = (await readFile(new URL('../src/services/chart-engine.ts', import.meta.url), 'utf8'))
    .replace(/\s*\/\/ #ifdef (?:WEB|APP)[\s\S]*?\/\/ #endif/g, '')
  const { code } = await transform(source, { loader: 'ts', format: 'cjs' })
  let calls = 0, complete
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)({ async(path) {
    assert.equal(path, '../chart-runtime/echarts.js')
    calls++
    return new Promise((resolve, reject) => { complete = { resolve, reject } })
  } }, module, module.exports)
  const { loadChartEngine } = module.exports
  const first = loadChartEngine(), duplicate = loadChartEngine()
  assert.equal(first, duplicate)
  assert.equal(calls, 1)
  const rejection = assert.rejects(first, /离线/)
  complete.reject(new Error('离线')); await rejection
  const retry = loadChartEngine()
  assert.equal(calls, 2)
  complete.resolve({ init: 'fixture' })
  assert.deepEqual(await retry, { init: 'fixture' })
  assert.equal(loadChartEngine(), retry)
})

test('横轴保留首尾并避免末尾标签重叠，短月份可以完整显示', () => {
  const labels = Array.from({ length: 63 }, (_, i) => '2021-' + i);
  const points = labels.map((_, i) => 30 + i * 280 / 62);
  const visible = layoutChartAxisLabels(labels, points, 318, labels.map(() => 48));
  assert.equal(visible[0].index, 0);
  assert.equal(visible.at(-1).index, 62);
  for (let i = 1; i < visible.length; i++) assert.ok(visible[i].left >= visible[i - 1].left + visible[i - 1].width + 4);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  assert.equal(layoutChartAxisLabels(months, months.map((_, i) => 32 + i * 208 / 11), 248, months.map(() => 14)).length, 12);
  assert.deepEqual(layoutChartAxisLabels(['01'], [120], 248, [14]).map(item => item.label), ['01']);
  assert.deepEqual(layoutChartAxisLabels([], [], 248, []), []);
});
