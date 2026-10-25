import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'

async function harness() {
  const registrySource = (await readFile('src/services/modal-presence.ts', 'utf8'))
    .replace(/import[^\n]+\n/g, '').replace(/export /g, '')
  const registryJs = (await transform(registrySource, { loader: 'ts' })).code
  const registry = new Function('computed', 'ref', registryJs + '\nreturn { modalOpen, registerModal }')(computed, ref)
  const component = await readFile('src/components/ChartCanvas.uvue', 'utf8')
  const stack = [true]
  const script = component.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    .split('\n').filter(line => {
      const directive = line.match(/\/\/ #(ifdef|ifndef) (\S+)/)
      if (directive) {
        const matches = directive[2] === 'MP-WEIXIN'
        stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
        return false
      }
      if (line.includes('// #endif')) { stack.pop(); return false }
      return stack.at(-1)
    }).join('\n').replace(/import[^\n]+\n/g, '')
  const js = (await transform(script, { loader: 'ts' })).code
  const instances = [], pendingContexts = [], cleanups = []
  const props = reactive({ option: { grid: { left: 20, bottom: 20 }, yAxis: { axisLine: { show: false } }, xAxis: { data: ['模拟日期'] }, series: [] }, label: '模拟图表' })
  const fixture = {
    computed, ref, reactive, nextTick, watch, ...registry,
    defineProps: () => props, defineEmits: () => () => {}, getCurrentInstance: () => ({ uid: 1 }),
    onMounted: () => {}, onUnmounted: callback => cleanups.push(callback), useWindowResize: () => {},
    chartHeight: 228, chartAxisLabel: String, createChartSurface: value => value,
    loadChartEngine: async () => ({ init: () => {
      const instance = { disposed: false, setOption: option => { instance.option = option },
        dispose: () => { instance.disposed = true },
        getModel: () => ({ getComponent: () => ({ axis: { scale: { getTicks: () => [] } } }) }),
        getZr: () => ({ flush() {} }), convertToPixel: () => 20,
      }
      instances.push(instance)
      return instance
    } }),
    typography: { roles: { caption: { weight: 400, size: 12, lineHeight: 16 } }, families: { canvas: 'sans-serif' } }, spacing: { detail: 4 },
    uni: {
      createSelectorQuery: () => ({ in() { return this }, select() { return this }, boundingClientRect(callback) { callback({ width: 320, left: 0 }); return this }, exec() {} }),
      createCanvasContextAsync: callbacks => pendingContexts.push(() => callbacks.success({ getContext: () => ({ save() {}, restore() {}, measureText: () => ({ width: 20 }) }) })),
      getWindowInfo: () => ({ pixelRatio: 2 }),
    },
  }
  const result = new Function(...Object.keys(fixture), js + '\nreturn { canvasVisible, initialize }')(...Object.values(fixture))
  const flush = async () => { for (let i = 0; i < 8; i++) await nextTick() }
  return { ...registry, ...result, props, instances, pendingContexts, flush, cleanup: () => cleanups.forEach(fn => fn()) }
}

test('微信背景画布在嵌套弹窗期间移除，全部关闭后使用最新数据重建', async () => {
  const h = await harness()
  const initial = h.initialize()
  await h.flush(); h.pendingContexts.shift()(); await initial
  assert.equal(h.instances.length, 1)
  const close = h.registerModal(), closeNested = h.registerModal()
  await h.flush()
  assert.equal(h.canvasVisible.value, false)
  assert.equal(h.instances[0].disposed, true)
  h.props.option = { ...h.props.option, xAxis: { data: ['更新日期'] } }
  await h.flush()
  assert.equal(h.pendingContexts.length, 0)
  close(); await h.flush()
  assert.equal(h.canvasVisible.value, false)
  closeNested(); await h.flush()
  assert.equal(h.canvasVisible.value, true)
  h.pendingContexts.shift()(); await h.flush()
  assert.equal(h.instances.length, 2)
  assert.deepEqual(h.instances[1].option.xAxis.data, ['更新日期'])
  h.cleanup()
})

test('弹窗打开后，迟到的微信画布初始化回调不得恢复遮挡层', async () => {
  const h = await harness()
  const initial = h.initialize()
  await h.flush()
  const close = h.registerModal()
  await h.flush()
  h.pendingContexts.shift()(); await initial
  assert.equal(h.instances.length, 0)
  assert.equal(h.canvasVisible.value, false)
  close(); await h.flush()
  h.pendingContexts.shift()(); await h.flush()
  assert.equal(h.instances.length, 1)
  h.cleanup()
})
