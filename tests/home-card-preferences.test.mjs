import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
const source = await readFile(new URL('../src/services/home-card-preferences.ts', import.meta.url), 'utf8')
const { createHomeCardPreferences, homeCardState, moveHomeCard } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const items = [{ cardKey: 'section.goal', group: 'section', isEnabled: 1, sortOrder: 0 }, { cardKey: 'section.reading', group: 'section', isEnabled: 1, sortOrder: 1 }]
const deferred = () => { let resolve, reject; return { promise: new Promise((done, fail) => { resolve = done; reject = fail }), resolve: value => resolve(value), reject: error => reject(error) } }
test('初次失败不套用默认值、不允许写入；重试成功', async () => {
  const state = homeCardState(); let failed = true, calls = 0
  const controller = createHomeCardPreferences(state, async () => { calls++; if (failed) throw Error('network'); return items }, () => 'A')
  await controller.load(); assert.equal(state.ready, false); assert.match(state.error, /network/)
  assert.equal(await controller.toggle('section.goal', false), false); assert.equal(calls, 1)
  failed = false; await controller.load(); assert.equal(state.ready, true); assert.equal(state.error, '')
})
test('切换账号或清除状态后迟到的读取和保存不能回填', async () => {
  const state = homeCardState(); const pending = deferred(); let owner = 'A'
  const controller = createHomeCardPreferences(state, () => pending.promise, () => owner)
  const run = controller.load(); owner = 'B'; controller.clear(); pending.resolve(items); await run
  assert.deepEqual(state.items, []); assert.equal(state.ready, false)
})
test('保存去重、失败回退、排序不携带开关避免覆盖另一端', async () => {
  const state = homeCardState(); const pending = deferred(); const calls = []
  const controller = createHomeCardPreferences(state, (path, method, body) => { calls.push({ path, method, body }); return method === 'GET' ? Promise.resolve(items) : pending.promise }, () => 'A')
  await controller.load(); const run = controller.reorder('section', ['section.reading', 'section.goal'])
  assert.deepEqual(state.items.map(item => item.cardKey), ['section.reading', 'section.goal'])
  assert.deepEqual(state.items.map(item => item.sortOrder), [0, 1])
  assert.equal(state.busy, 'section'); assert.equal(await controller.toggle('section.goal', false), false)
  assert.deepEqual(calls[1].body, { group: 'section', keys: ['section.reading', 'section.goal'] })
  pending.resolve([...items].reverse()); await run; assert.equal(state.busy, ''); assert.equal(state.items[0].cardKey, 'section.reading')
  const failed = createHomeCardPreferences(state, async () => { throw Error('save failed') }, () => 'A')
  await assert.rejects(failed.toggle('section.goal', false)); assert.equal(state.items[1].isEnabled, 1); assert.equal(state.busy, '')
})
test('拖动可跨多行，上下边界不改变数据且原列表不变', () => {
  const original = ['a', 'b', 'c', 'd']; assert.deepEqual(moveHomeCard(original, 0, 3), ['b','c','d','a'])
  assert.deepEqual(moveHomeCard(original, 3, 0), ['d','a','b','c'])
  assert.deepEqual(moveHomeCard(original, 0, -1), original); assert.deepEqual(original, ['a','b','c','d'])
})

test('排序松手即更新，保存失败恢复原顺序，不改变其他分组及开关', async () => {
  const original = [{ cardKey: 'overview.read', group: 'overview', isEnabled: 1, sortOrder: 0 },
    ...items, { cardKey: 'section.movie', group: 'section', isEnabled: 0, sortOrder: 2 }]
  const state = { ...homeCardState(), ready: true, items: original }
  const pending = deferred(), calls = []
  const controller = createHomeCardPreferences(state, (...args) => { calls.push(args); return pending.promise }, () => 'A')
  const run = controller.reorder('section', ['section.reading', 'section.goal', 'section.movie'])
  assert.deepEqual(state.items.map(item => item.cardKey), ['overview.read', 'section.reading', 'section.goal', 'section.movie'])
  assert.equal(state.items[0], original[0])
  assert.equal(state.items[3].isEnabled, 0)
  assert.deepEqual(original.map(item => item.sortOrder), [0, 0, 1, 2])
  assert.equal(await controller.reorder('section', ['section.goal', 'section.reading', 'section.movie']), false)
  assert.equal(calls.length, 1)
  pending.reject(new Error('排序失败'))
  await assert.rejects(run, /排序失败/)
  assert.equal(state.items, original)
  assert.equal(state.busy, '')
})
for (const failed of [false, true]) test(`排序${failed ? '失败' : '成功'}的迟到响应不能覆盖新账号内容`, async () => {
  const state = { ...homeCardState(), ready: true, items }
  const pending = deferred(); let owner = 'A'
  const controller = createHomeCardPreferences(state, () => pending.promise, () => owner)
  const run = controller.reorder('section', ['section.reading', 'section.goal'])
  owner = 'B'; controller.clear()
  const replacement = [{ cardKey: 'section.links', group: 'section', isEnabled: 1, sortOrder: 0 }]
  state.items = replacement; state.ready = true
  if (failed) { pending.reject(new Error('network')); await assert.rejects(run, /network/) }
  else { pending.resolve([...items].reverse()); assert.equal(await run, false) }
  assert.equal(state.items, replacement)
  assert.equal(state.busy, '')
})
test('排序列表不完整或重复时不改变本地顺序，也不提交', async () => {
  const state = { ...homeCardState(), ready: true, items }; let calls = 0
  const controller = createHomeCardPreferences(state, async () => { calls++; return items }, () => 'A')
  await assert.rejects(controller.reorder('section', ['section.goal']), /列表已变化/)
  await assert.rejects(controller.reorder('section', ['section.goal', 'section.goal']), /列表已变化/)
  assert.equal(state.items, items); assert.equal(calls, 0)
})

// 执行设置页的真实脚本，用受控视图回调模拟微信 setData 尚未完成的阶段。
async function settingsController(state, homeCards, viewTick) {
  const { transform } = await import('esbuild')
  const page = await readFile(new URL('../src/pages/home-settings/index.uvue', import.meta.url), 'utf8')
  const script = page.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const { code } = await transform(`export function create(state, homeCards, viewTick, moveHomeCard) {
    const ref = value => ({ value }), computed = get => ({ get value() { return get() } });
    const getCurrentInstance = () => ({ proxy: { $nextTick: viewTick } });
    const nextTick = () => Promise.resolve(), onShow = () => {}, onHide = () => {}, onUnmounted = () => {};
    const usePageRefresh = () => () => {}, menuVisuals = {}, request = () => {};
    const spacing = { controlMin: 44, detail: 4 }, uni = { showToast: () => {} };
    ${script}
    return { dragging, dragGroup, from, target, offset, busy, finish, cancel, rowStyle };
  }`, { loader: 'ts', format: 'esm' })
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  return module.create(state, homeCards, viewTick, moveHomeCard)
}

for (const interruption of ['none', 'cancel', 'reload']) test(`设置页先清除位移再换序，视图等待期间 ${interruption}`, async () => {
  const state = { ...homeCardState(), ready: true, items: [...items] }
  const rendered = deferred(), calls = []
  const order = await settingsController(state, { reorder: async (...args) => { calls.push(args) } }, () => rendered.promise)
  order.dragging.value = items[0].cardKey; order.dragGroup.value = 'section'
  order.from.value = 0; order.target.value = 1; order.offset.value = 48
  assert.deepEqual(order.rowStyle(items[0]), { transform: 'translateY(48px)', zIndex: 2 })
  const finish = order.finish()
  assert.equal(order.busy.value, true)
  for (const item of items) assert.deepEqual(order.rowStyle(item), { transform: 'none', zIndex: 0 })
  assert.deepEqual(calls, [])
  if (interruption === 'cancel') order.cancel()
  if (interruption === 'reload') state.items = [...items].reverse()
  rendered.resolve(); await finish
  assert.deepEqual(calls, interruption === 'none' ? [['section', ['section.reading', 'section.goal']]] : [])
  assert.equal(order.busy.value, false)
})
