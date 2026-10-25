import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'esbuild'
import { computed, nextTick, ref, shallowRef } from 'vue'

const source = await readFile('src/services/modal-back.ts', 'utf8')
const service = transformSync(source.replace(/^import .* from 'vue'\n/m, '').replace('export function', 'function'), { loader: 'ts' }).code
const { registerModalBack } = new Function('computed', 'nextTick', 'ref', 'shallowRef',
  service + '\nreturn { registerModalBack }')(computed, nextTick, ref, shallowRef)
const componentSource = await readFile('src/components/WeixinModalBackGuard.uvue', 'utf8')
const component = transformSync(componentSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*\n/gm, ''), { loader: 'ts' }).code

// 执行真实 guard 脚本和登记服务；仅模拟微信 page-container 的返回生命周期。
// 不能据此声称系统返回键或 iOS 手势已通过真机验证。
function mount(page, onClose, busy = false, flushNative = nextTick) {
  const props = { busy }
  let cleanup
  const h = new Function('getCurrentInstance', 'onBeforeUnmount', 'registerModalBack', 'defineProps', 'defineEmits',
    component + '\nreturn { isHost, shown, beforeLeave, afterLeave, dispose }')(
    () => ({ root: page, proxy: { $nextTick: flushNative } }), callback => { cleanup = callback }, registerModalBack,
    () => props, () => onClose,
  )
  return { ...h, props, unmount: () => cleanup() }
}
async function back(host) {
  host.beforeLeave()
  await host.afterLeave()
}

test('首页单弹窗返回关闭，重复原生事件不重复触发关闭', async () => {
  let calls = 0
  const modal = mount({}, () => { calls++; modal.unmount() })
  try {
    assert.equal(modal.isHost.value, true)
    await back(modal)
    await modal.afterLeave()
    assert.equal(calls, 1)
    assert.equal(modal.isHost.value, false)
    assert.equal(modal.shown.value, false)
  } finally { modal.unmount() }
})

test('嵌套编辑、日历和确认层共用一个容器，每次返回只关闭最上层', async () => {
  const page = {}, closed = []
  const outer = mount(page, () => { closed.push('编辑'); outer.unmount() })
  const inner = mount(page, () => { closed.push('日历'); inner.unmount() })
  const confirm = mount(page, () => { closed.push('确认'); confirm.unmount() })
  try {
    assert.deepEqual([outer, inner, confirm].map(item => item.isHost.value), [true, false, false])
    await back(outer)
    assert.deepEqual(closed, ['确认'])
    assert.equal(outer.shown.value, true)
    await back(outer)
    assert.deepEqual(closed, ['确认', '日历'])
    await back(outer)
    assert.deepEqual(closed, ['确认', '日历', '编辑'])
  } finally { confirm.unmount(); inner.unmount(); outer.unmount() }
})

test('保存中返回不关闭或穿透外层，保存结束后返回可以关闭', async () => {
  const page = {}, closed = []
  const outer = mount(page, () => closed.push('外层'))
  const inner = mount(page, () => { closed.push('内层'); inner.unmount() }, true)
  try {
    await back(outer)
    assert.deepEqual(closed, [])
    assert.equal(outer.shown.value, true)
    inner.props.busy = false
    await back(outer)
    assert.deepEqual(closed, ['内层'])
    assert.equal(outer.shown.value, true)
  } finally { inner.unmount(); outer.unmount() }
})

test('相同路由的不同页面实例互不影响，卸载后再次打开没有陈旧宿主', async () => {
  const firstPage = { route: 'pages/time/index' }, secondPage = { route: 'pages/time/index' }
  const closed = []
  const first = mount(firstPage, () => closed.push('第一页'))
  const second = mount(secondPage, () => { closed.push('第二页'); second.unmount() })
  let reopened
  try {
    assert.equal(first.isHost.value, true)
    assert.equal(second.isHost.value, true)
    await back(second)
    assert.deepEqual(closed, ['第二页'])
    first.unmount()
    reopened = mount(firstPage, () => { closed.push('重新打开'); reopened.unmount() })
    await back(reopened)
    assert.deepEqual(closed, ['第二页', '重新打开'])
  } finally { first.unmount(); second.unmount(); reopened?.unmount() }
})

test('返回动画期间主动取消目标，不误关闭外层；卸载宿主后不重新显示', async () => {
  const page = {}
  const outer = mount(page, () => assert.fail('不能误关外层'))
  const inner = mount(page, () => assert.fail('已取消的目标不能再次关闭'))
  try {
    outer.beforeLeave()
    inner.unmount()
    await outer.afterLeave()
    assert.equal(outer.shown.value, true)
    outer.beforeLeave()
    outer.unmount()
    await outer.afterLeave()
    assert.equal(outer.isHost.value, false)
  } finally { inner.unmount(); outer.unmount() }
})

test('返回动画期间新弹窗打开，不将旧事件交给新弹窗或底层', async () => {
  const page = {}
  const outer = mount(page, () => assert.fail('不能越过新弹窗关闭旧层'))
  let inner
  try {
    outer.beforeLeave()
    inner = mount(page, () => assert.fail('新弹窗不能被之前的返回事件关闭'))
    await outer.afterLeave()
    assert.equal(outer.shown.value, true)
  } finally { inner?.unmount(); outer.unmount() }
})

test('宿主主动卸载后剩余弹窗接管返回，最终清理可重复执行', async () => {
  const page = {}
  let calls = 0
  const outer = mount(page, () => assert.fail('旧宿主已经卸载'))
  const inner = mount(page, () => { calls++; inner.unmount() })
  try {
    outer.unmount()
    outer.unmount()
    assert.equal(inner.isHost.value, true)
    await back(inner)
    assert.equal(calls, 1)
    assert.equal(inner.isHost.value, false)
  } finally { inner.unmount(); outer.unmount() }
})

test('等待微信视图收到隐藏状态后才重新启用，期间卸载不得复活', async () => {
  let finishNative
  const flushed = new Promise(resolve => { finishNative = resolve })
  const modal = mount({}, () => assert.fail('busy 不关闭'), true, () => flushed)
  try {
    modal.beforeLeave()
    const pending = modal.afterLeave()
    await nextTick()
    assert.equal(modal.shown.value, false)
    modal.unmount()
    finishNative()
    await pending
    assert.equal(modal.shown.value, false)
  } finally { finishNative(); modal.unmount() }
})
