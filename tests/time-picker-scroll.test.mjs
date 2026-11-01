import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'

// 执行真实组件脚本，手动交错用户滚动与微信 scroll-top 的异步回执。
const source = await readFile(new URL('../src/components/TimeEndPicker.uvue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?[ \t]*\r?\n/gm, '')
const js = (await transform(script, { loader: 'ts' })).code
const selectionSource = await readFile(new URL('../src/services/time-selection.ts', import.meta.url), 'utf8')
const selection = await import(`data:text/javascript;base64,${Buffer.from(selectionSource).toString('base64')}`)
const spacing = JSON.parse(await readFile(new URL('../src/styles/spacing.json', import.meta.url), 'utf8'))
const row = spacing.controlMin - spacing.detail

function harness(t, options = {}) {
  const props = reactive({ value: 12 * 60 + 37, min: 0, max: 1439, ...options })
  const timers = new Map(), cleanups = [], events = [], scope = effectScope()
  let timerId = 0
  const fixture = {
    ...selection, computed, ref, watch, nextTick, spacing,
    defineProps: () => props, withDefaults: value => value,
    defineEmits: () => (...event) => events.push(event),
    uni: { getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }) },
    isDark: ref(false), useWindowResize: () => {}, registerModal: () => () => {},
    onUnmounted: callback => cleanups.push(callback),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval: () => {},
  }
  const component = scope.run(() => new Function(...Object.keys(fixture), js + `
    return { selected, hourScrollTop, minuteScrollTop, changeWheel, startWheelTouch,
      endWheelTouch, selectWheel, confirmSelection }
  `)(...Object.values(fixture)))
  t.after(() => { cleanups.forEach(callback => callback()); scope.stop() })
  const scroll = (field, index) => component.changeWheel({ detail: { scrollTop: index * row } }, field)
  scroll('hour', Math.floor(props.value / 60))
  scroll('minute', props.value)
  const flush = async () => { await nextTick(); await nextTick() }
  const settle = async () => {
    const pending = [...timers.values()]
    timers.clear()
    pending.forEach(callback => callback())
    await flush()
  }
  return { ...component, props, events, scroll, flush, settle }
}

test('连续向前选小时：延迟的分钟定位回执不能回退小时或改变分钟', async t => {
  const h = harness(t)
  h.startWheelTouch('hour')
  h.scroll('hour', 11)
  await h.flush()
  h.scroll('hour', 10)
  await h.flush()
  assert.equal(h.selected.value, 637)
  // 前一次联动定位在后一次手势之后才通知逻辑层。
  for (const stale of [697, 757, 697, 637]) {
    h.scroll('minute', stale)
    await h.flush()
    assert.equal(h.selected.value, 637, `延迟分钟回执 ${stale}`)
  }
  h.endWheelTouch('hour')
  await h.settle()
  h.scroll('minute', 696)
  h.scroll('minute', 697)
  await h.settle()
  assert.equal(h.selected.value, 637)
  assert.equal(h.minuteScrollTop.value, 637 * row)
  h.confirmSelection()
  assert.deepEqual(h.events.filter(([name]) => name === 'change'), [['change', 637]])
})

test('分钟反向跨小时：延迟的小时定位回执不能把分钟拉到另一小时', async t => {
  const h = harness(t, { value: 721 })
  h.startWheelTouch('minute')
  h.scroll('minute', 719)
  await h.flush()
  h.scroll('minute', 659)
  await h.flush()
  h.scroll('hour', 11)
  h.scroll('hour', 12)
  assert.equal(h.selected.value, 659)
  h.endWheelTouch('minute')
  await h.settle()
  assert.equal(h.hourScrollTop.value, 10 * row)
})

test('禁选边界吸附的中间回执不能取消最终定位', async t => {
  const h = harness(t, { value: 637, min: 600 })
  h.startWheelTouch('hour')
  h.scroll('hour', 9.6)
  h.endWheelTouch('hour')
  // 模拟先回写真实位置、再 nextTick 写目标之间到达的 scroll 回执。
  const settling = h.settle()
  h.scroll('hour', 9.6)
  await settling
  assert.equal(h.hourScrollTop.value, 10 * row)
  assert.equal(h.selected.value, 637)
})

test('往前滑到非整点下界，旧回执不能同时改掉边界小时和分钟', async t => {
  const h = harness(t, { value: 697, min: 655 })
  h.startWheelTouch('hour')
  h.scroll('hour', 10)
  await h.flush()
  assert.equal(h.selected.value, 655)
  h.scroll('hour', 9)
  h.scroll('minute', 697)
  assert.equal(h.selected.value, 655)
  h.endWheelTouch('hour')
  await h.settle()
  assert.equal(h.hourScrollTop.value, 10 * row)
  assert.equal(h.minuteScrollTop.value, 655 * row)
})

test('切换操作列后，上一列的惯性事件不能抢回选择权', async t => {
  const h = harness(t)
  h.startWheelTouch('hour')
  h.scroll('hour', 11)
  h.endWheelTouch('hour')
  await h.flush()
  h.startWheelTouch('minute')
  h.scroll('minute', 696)
  h.scroll('hour', 10)
  assert.equal(h.selected.value, 696)
  h.endWheelTouch('minute')
  await h.settle()
  assert.equal(h.hourScrollTop.value, 11 * row)
})

test('点击选中和外部值变化后，旧滚动回执不能覆盖新时间', async t => {
  const h = harness(t)
  h.startWheelTouch('hour')
  h.scroll('hour', 11)
  h.endWheelTouch('hour')
  h.selectWheel(10, 'hour')
  h.scroll('hour', 12)
  h.scroll('minute', 697)
  assert.equal(h.selected.value, 637)
  h.props.value = 600
  await h.flush()
  h.scroll('minute', 637)
  h.scroll('minute', 697)
  assert.equal(h.selected.value, 600)
})
