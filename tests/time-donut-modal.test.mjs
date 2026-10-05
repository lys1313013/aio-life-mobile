import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'

async function registry() {
  const source = await readFile(new URL('../src/services/modal-presence.ts', import.meta.url), 'utf8')
  const js = (await transform(source.replace(/import[^\n]+\n/g, '').replace(/export /g, ''), { loader: 'ts' })).code
  return new Function('computed', 'ref', js + '\nreturn { modalOpen, registerModal }')(computed, ref)
}

async function donut() {
  const source = await readFile(new URL('../src/pages/home/TimeDonut.uvue', import.meta.url), 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    .replace(/\/\/ #ifdef (\S+)\n([\s\S]*?)\/\/ #endif/g, (_, platform, code) => platform === 'MP-WEIXIN' ? code : '')
    .replace(/\/\/ #ifndef (\S+)\n([\s\S]*?)\/\/ #endif/g, (_, platform, code) => platform !== 'MP-WEIXIN' ? code : '')
    .replace(/import[^\n]+\n/g, '')
  const js = (await transform(script, { loader: 'ts' })).code
  const modals = await registry(), requests = [], timers = new Map(), paints = []
  const props = reactive({ groups: [{ id: 'one', minutes: 60, color: '#faad14' }], active: true })
  const isDark = ref(false)
  let mounted, unmounted, sequence = 0
  const fixture = {
    ...modals, computed, ref, watch, nextTick, isDark,
    defineProps: () => props, getCurrentInstance: () => ({ uid: 1 }),
    onMounted: fn => { mounted = fn }, onUnmounted: fn => { unmounted = fn },
    summaryDonutRotation: () => 0, summaryDonutLabels: () => [],
    setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id },
    clearTimeout: id => timers.delete(id),
    uni: { getWindowInfo: () => ({ pixelRatio: 2 }), createCanvasContextAsync: request => requests.push(request) },
  }
  const component = new Function(...Object.keys(fixture), js + '\nreturn { canvasVisible, failed }')(...Object.values(fixture))
  function resolve(request = requests.at(-1)) {
    const context = {
      canvas: { width: 0, height: 0 }, setTransform() {}, clearRect() {}, beginPath() {},
      arc() {}, closePath() {}, fill() { paints.push(this.fillStyle) },
    }
    request.success({ getContext: () => context })
  }
  await mounted()
  return { ...modals, ...component, props, isDark, requests, timers, paints, resolve, unmounted }
}

test('嵌套弹窗全部关闭才恢复，重复释放不影响后续弹窗', async () => {
  const h = await registry()
  const first = h.registerModal(), second = h.registerModal()
  assert.equal(h.modalOpen.value, true)
  first(); first(); assert.equal(h.modalOpen.value, true)
  second(); assert.equal(h.modalOpen.value, false)
  const third = h.registerModal()
  assert.equal(h.modalOpen.value, true)
  third(); assert.equal(h.modalOpen.value, false)
})

test('微信弹窗移除画布、停止动画，关闭后恢复最新数据且不重播动画', async () => {
  const h = await donut()
  h.resolve()
  assert.equal(h.timers.size, 1)
  const close = h.registerModal()
  await nextTick()
  assert.equal(h.canvasVisible.value, false)
  assert.equal(h.timers.size, 0)
  h.props.groups = [{ id: 'two', minutes: 30, color: '#722ed1' }]
  h.isDark.value = true
  await nextTick()
  const before = h.paints.length
  close(); await nextTick(); await nextTick()
  assert.equal(h.canvasVisible.value, true)
  assert.equal(h.requests.length, 2)
  h.resolve()
  assert.deepEqual(h.paints.slice(before), ['#722ed1', '#722ed1'])
  assert.equal(h.timers.size, 0)
  h.unmounted()
})

test('快速重开弹窗和离页使旧 Canvas 回调失效，返回后重新初始化', async () => {
  const h = await donut(), original = h.requests[0]
  const close = h.registerModal()
  await nextTick()
  h.resolve(original); original.fail()
  assert.equal(h.paints.length, 0)
  assert.equal(h.failed.value, false)
  close(); await nextTick(); await nextTick()
  const returning = h.requests.at(-1)
  const closeAgain = h.registerModal(); await nextTick()
  h.resolve(returning); returning.fail()
  assert.equal(h.paints.length, 0)
  h.props.active = false; closeAgain(); await nextTick()
  assert.equal(h.canvasVisible.value, false)
  const count = h.requests.length
  h.props.active = true; await nextTick(); await nextTick()
  assert.equal(h.requests.length, count + 1)
  h.unmounted(); h.resolve(); h.requests.at(-1).fail()
  assert.equal(h.paints.length, 0)
  assert.equal(h.failed.value, false)
})
