import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, ref, watch, nextTick } from 'vue'

const source = await readFile(new URL('../src/components/TimeRecordEditor.uvue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?[ \t]*\r?\n/gm, '')
const js = (await transform(script, { loader: 'ts' })).code
const day = '2026-10-26'
const detail = { id: '9223372036854775807', date: day, categoryId: '1', startTime: 60, endTime: 119,
  relateId: '9223372036854775806', relateType: 1,
  exercises: [{ id: '9223372036854775805', exerciseTypeId: '2', exerciseCount: 12, description: '模拟运动' }] }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function harness(props = { recordId: detail.id, initialDate: day }) {
  const calls = [], pending = [], cleanups = []
  const request = (name, value) => {
    calls.push([name, value])
    const task = deferred()
    pending.push(task)
    return task.promise
  }
  const session = { token: 'mock-session' }
  const fixture = {
    computed, ref, watch, nextTick, session,
    defineProps: () => props, withDefaults: value => value, defineEmits: () => () => {},
    getCurrentInstance: () => null, onMounted: () => {}, onUnmounted: fn => cleanups.push(fn),
    useWindowResize: () => {}, todayDate: () => day, categoryPath: () => '模拟分类',
    getCategories: () => request('categories'), getRecord: id => request('detail', id),
    getDateRecords: date => request('day', date), recommendNext: date => request('recommend', date),
    getRelateTypes: async () => [],
  }
  const component = new Function(...Object.keys(fixture), js + '\nreturn { initialize, id, date, ready, loading, errorText, form, existing, full }')(...Object.values(fixture))
  component.id.value = props.recordId || ''
  component.date.value = props.initialDate || day
  return { ...component, calls, pending, session, close: () => cleanups.forEach(fn => fn()) }
}

test('已知日期的编辑立即并发三请求，等待完整数据并保留关联与运动字段', async () => {
  const h = harness()
  const loading = h.initialize()
  assert.deepEqual(h.calls, [['categories', undefined], ['detail', detail.id], ['day', day]])
  h.pending[1].resolve(detail)
  h.pending[2].resolve([detail])
  await new Promise(setImmediate)
  assert.equal(h.ready.value, false)
  h.pending[0].resolve([{ id: '1', name: '模拟分类' }])
  await loading
  assert.equal(h.ready.value, true)
  assert.deepEqual(h.form.value, detail)
  assert.deepEqual(h.existing.value, [detail])
  assert.notEqual(h.form.value.exercises[0], detail.exercises[0])
})

test('仅有 ID 的入口不猜日期，先与分类并发取详情，再查询详情日期', async () => {
  const h = harness({ recordId: detail.id })
  const loading = h.initialize()
  assert.deepEqual(h.calls, [['categories', undefined], ['detail', detail.id]])
  h.pending[0].resolve([])
  h.pending[1].resolve({ ...detail, date: '2026-09-30' })
  await new Promise(setImmediate)
  assert.deepEqual(h.calls.at(-1), ['day', '2026-09-30'])
  h.pending[2].resolve([])
  await loading
  assert.equal(h.date.value, '2026-09-30')
  assert.equal(h.ready.value, true)
})

test('列表日期过期时补查详情日期，补查完成前不允许编辑提交', async () => {
  const h = harness()
  const loading = h.initialize()
  h.pending[0].resolve([])
  h.pending[1].resolve({ ...detail, date: '2026-09-30' })
  h.pending[2].resolve([detail])
  await new Promise(setImmediate)
  assert.deepEqual(h.calls.at(-1), ['day', '2026-09-30'])
  assert.equal(h.ready.value, false)
  const corrected = [{ ...detail, date: '2026-09-30' }]
  h.pending[3].resolve(corrected)
  await loading
  assert.deepEqual(h.existing.value, corrected)
})

for (const failed of [0, 1, 2]) test(`并发请求 ${failed} 失败保留不可提交状态，重试恢复`, async () => {
  const h = harness()
  const loading = h.initialize()
  const values = [[], detail, [detail]]
  h.pending.forEach((task, index) => index === failed ? task.reject(new Error('模拟加载失败')) : task.resolve(values[index]))
  await loading
  assert.equal(h.ready.value, false)
  assert.equal(h.loading.value, false)
  assert.equal(h.errorText.value, '模拟加载失败')
  const retry = h.initialize()
  h.pending.slice(3).forEach((task, index) => task.resolve(values[index]))
  await retry
  assert.equal(h.ready.value, true)
  assert.equal(h.errorText.value, '')
})

for (const invalidate of ['close', 'session', 'generation']) test(`请求中 ${invalidate} 变化后，旧响应不写入表单或继续补查`, async () => {
  const h = harness()
  const loading = h.initialize()
  if (invalidate === 'close') h.close()
  if (invalidate === 'session') h.session.token = 'another-mock-session'
  let latest
  if (invalidate === 'generation') latest = h.initialize()
  h.pending[0].resolve([])
  h.pending[1].resolve({ ...detail, date: '2026-09-30' })
  h.pending[2].resolve([])
  await loading
  assert.equal(h.ready.value, false)
  assert.equal(h.form.value.id, '')
  assert.equal(h.calls.length, invalidate === 'generation' ? 6 : 3)
  if (latest) {
    h.pending[3].resolve([])
    h.pending[4].resolve(detail)
    h.pending[5].resolve([detail])
    await latest
    assert.equal(h.ready.value, true)
  }
})

test('新增分类与推荐并发，全天已满仍禁止提交', async () => {
  const h = harness({ initialDate: '2026-09-30' })
  const loading = h.initialize()
  assert.deepEqual(h.calls, [['categories', undefined], ['recommend', '2026-09-30']])
  h.pending[0].resolve([])
  h.pending[1].resolve({ recommend: null, records: [] })
  await loading
  assert.equal(h.ready.value, false)
  assert.equal(h.full.value, true)
  assert.equal(h.loading.value, false)
})
