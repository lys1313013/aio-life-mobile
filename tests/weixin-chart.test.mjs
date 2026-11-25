import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'
import { nextTick, reactive, ref, watch } from 'vue'

const source = await readFile('src/components/ChartCanvas.uvue', 'utf8')
function weixinBranch(source) {
  const stack = [true]
  return source.split('\n').filter(line => {
    const directive = line.match(/(?:\/\/|<!--) #(ifdef|ifndef) (\S+)/)
    if (directive) {
      const weixin = directive[2] === 'MP-WEIXIN'
      stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? weixin : !weixin))
      return false
    }
    if (line.includes('#endif')) { stack.pop(); return false }
    return stack.at(-1)
  }).join('\n')
}

const script = weixinBranch(source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1])
  .replace(/^import[^\n]*\n/gm, '')
const { code } = await transform(script, { loader: 'ts' })
const { outputFiles } = await build({
  entryPoints: ['src/services/chart-engine-weixin.ts', 'src/services/chart-options.ts'],
  outdir: 'test-bundle', bundle: true, write: false, format: 'cjs', platform: 'browser',
})
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const spacing = await readJson('src/styles/spacing.json')
const typography = await readJson('src/styles/typography.json')
let measurements = 0
const wx = {
  createOffscreenCanvas(options) {
    measurements++
    assert.deepEqual(options, { type: '2d', width: 1, height: 1 })
    return { getContext: () => ({ save() {}, restore() {}, measureText: text => ({ width: Array.from(text).length * 7 }) }) }
  },
}
function loadBundle(name) {
  const module = { exports: {} }
  new Function('module', 'wx', outputFiles.find(file => file.path.endsWith('/' + name + '.js')).text)(module, wx)
  return module.exports
}
const engine = loadBundle('chart-engine-weixin')
const options = loadBundle('chart-options')

function harness(t, option, loadChartEngine = async () => engine) {
  const props = reactive({ option, label: '模拟图表' })
  const events = []
  const bounds = { width: 360, left: 18, top: 90 }
  const fixture = {
    ref, nextTick, watch, spacing, typography, ...options, loadChartEngine,
    defineProps: () => props, defineEmits: () => (...args) => events.push(args),
    getCurrentInstance: () => ({ proxy: {} }), onMounted: () => {}, onUnmounted: callback => t.after(callback),
    useWindowResize: () => {},
    uni: {
      createSelectorQuery: () => ({
        in() { return this }, select(name) { assert.equal(name, '.aio-chart-renderer'); return this },
        boundingClientRect(callback) { callback(bounds); return this }, exec() {},
      }),
      arrayBufferToBase64: value => Buffer.from(value).toString('base64'),
      createCanvasContextAsync: () => assert.fail('微信端不应申请屏幕画布'),
    },
  }
  const component = new Function(...Object.keys(fixture), code +
    '\nreturn { initialize, imageSource, imageLoading, imageLoaded, imageFailed, error, select, resize }')(...Object.values(fixture))
  return {
    ...component, events, props, bounds,
    svg: () => Buffer.from(component.imageSource.value.split(',')[1], 'base64').toString('utf8'),
  }
}

test('微信图表以普通图片进入滚动布局', () => {
  const template = weixinBranch(source.match(/<template>([\s\S]*?)<\/template>/)[1])
  assert.match(template, /<image\b[^>]+:src="imageSource"/)
  assert.doesNotMatch(template, /<canvas\b/)
})

test('堆叠柱和折线输出 SVG，滚动后的触摸坐标按当前容器换算', async t => {
  const settings = { kind: 'bar', dark: false, stacked: true, showScale: true, width: 360, selected: 0, selectionActive: false }
  const series = [{ name: '散步', values: [2, 5], color: '#427bea' }, { name: '跑步', values: [3, 1], color: '#e05260' }]
  const h = harness(t, options.buildChartOption(['1月', '2月'], series, settings))
  await h.initialize()
  assert.match(h.svg(), /<svg [^>]*width="360" height="228"/)
  assert.match(h.svg(), /fill="#427bea"/)
  assert.match(h.svg(), /fill="#e05260"/)
  assert.equal(h.imageLoading.value, true)
  h.imageLoaded()
  assert.deepEqual(h.events.at(-1), ['ready', true])
  const layout = h.events.find(([event]) => event === 'layout')[1]
  assert.equal(layout.series[0].points[0].bar.height < 0, true)
  h.bounds.left = -42
  h.bounds.top = -76
  await h.select({ changedTouches: [{ clientX: h.bounds.left + layout.points[1], clientY: 60 }] })
  assert.deepEqual(h.events.at(-1), ['select', 1])

  h.props.option = options.buildChartOption(['1月', '2月'], series, { ...settings, kind: 'line', stacked: false, dark: true })
  await nextTick()
  await nextTick()
  assert.match(h.svg(), /stroke="#427bea"/)
  assert.match(h.svg(), /stroke="#34373d"/)
  assert.equal(h.imageLoading.value, false)
  h.bounds.width = 480
  await h.resize()
  assert.match(h.svg(), /width="480"/)
  assert.equal(measurements, 1)
})

test('环图保留中文和扇区点选，图片加载失败可重试', async t => {
  const h = harness(t, {
    animation: false,
    series: [{
      type: 'pie', radius: [35, 75], avoidLabelOverlap: false,
      data: [{ name: '模拟散步 & 瑜伽', value: 3 }, { name: '模拟跑步', value: 1 }],
    }],
  })
  await h.initialize()
  assert.match(h.svg(), /模拟散步 &amp; 瑜伽/)
  assert.match(h.svg(), /模拟跑步/)
  h.imageFailed()
  assert.match(h.error.value, /图表加载失败/)
  assert.equal(h.imageSource.value, '')
  await h.initialize()
  h.imageLoaded()
  assert.equal(h.error.value, '')
  const { left, top, width } = h.bounds
  await h.select({ changedTouches: [{ clientX: left + width / 2 + 50, clientY: top + 114 }] })
  assert.deepEqual(h.events.at(-1), ['select', 0])
  await h.select({ changedTouches: [{ clientX: left + width / 2, clientY: top + 114 }] })
  assert.deepEqual(h.events.at(-1), ['leave'])
})
