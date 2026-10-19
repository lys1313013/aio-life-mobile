import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

async function harness(route = 'pages/home/index') {
  const source = await readFile('src/services/modal-tab-bar.ts', 'utf8')
  const js = (await transform(source.replace(/export /g, ''), { loader: 'ts' })).code
  const calls = [], pending = []
  const invoke = (name, options) => { calls.push(name); pending.push(options) }
  const { registerModalTabBar } = new Function('uni', 'getCurrentPages', js + '\nreturn { registerModalTabBar }')({
    hideTabBar: options => invoke('hide', options),
    showTabBar: options => invoke('show', options),
  }, () => route ? [{ route }] : [])
  return { registerModalTabBar, calls, pending, finish: () => pending.shift().success() }
}

test('四个原生 tab 页的弹窗打开后隐藏底栏，关闭后恢复且不使用动画', async () => {
  for (const page of ['home', 'time', 'life', 'profile']) {
    const h = await harness(`pages/${page}/index`)
    const close = h.registerModalTabBar()
    assert.deepEqual(h.calls, ['hide'])
    assert.equal(h.pending[0].animation, false)
    h.finish()
    close()
    assert.deepEqual(h.calls, ['hide', 'show'])
    h.finish()
  }
})

test('编辑弹窗与时间选择器嵌套时，最后一层关闭才恢复底栏', async () => {
  const h = await harness()
  const closeEditor = h.registerModalTabBar()
  h.finish()
  const closePicker = h.registerModalTabBar()
  closePicker(); closePicker()
  assert.deepEqual(h.calls, ['hide'])
  closeEditor()
  assert.deepEqual(h.calls, ['hide', 'show'])
  h.finish()
  closeEditor()
  assert.deepEqual(h.calls, ['hide', 'show'])
})

test('隐藏尚未完成就关闭，以及恢复尚未完成就重开，最终状态跟随最新弹窗', async () => {
  const h = await harness()
  const close = h.registerModalTabBar()
  close()
  assert.deepEqual(h.calls, ['hide'])
  h.finish()
  assert.deepEqual(h.calls, ['hide', 'show'])
  const closeAgain = h.registerModalTabBar()
  h.finish()
  assert.deepEqual(h.calls, ['hide', 'show', 'hide'])
  h.finish()
  closeAgain()
  assert.deepEqual(h.calls, ['hide', 'show', 'hide', 'show'])
  h.finish()
})

test('独立编辑页、业务分包及无页面栈时不调用 tabBar 接口', async () => {
  for (const route of ['pages/time/edit', 'pages/records/exercise', '']) {
    const h = await harness(route)
    const close = h.registerModalTabBar()
    close(); close()
    assert.deepEqual(h.calls, [])
  }
})

test('原生接口失败不会无限重试，后续打开弹窗仍可隐藏和恢复', async () => {
  const h = await harness()
  const close = h.registerModalTabBar()
  h.pending.shift().fail()
  close()
  assert.deepEqual(h.calls, ['hide'])
  const closeAgain = h.registerModalTabBar()
  h.finish()
  closeAgain()
  h.finish()
  assert.deepEqual(h.calls, ['hide', 'hide', 'show'])
})
