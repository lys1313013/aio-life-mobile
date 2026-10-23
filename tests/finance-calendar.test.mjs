import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
async function source(name) {
  const code = (await transform(await readFile(new URL('../src/pages/home/services/' + name + '.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
const { modesFor, readCalendarMode, saveCalendarMode, calendarScope, calendarPlaceholder, calendarMoney, moveCalendarDate, readCalendar, detailQuery, detailState, createDetailsController } = await source('finance-calendar')
const { summaryState, createSummaryController } = await source('summary-cards')
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { resolve, promise } }
const tick = () => new Promise(resolve => setImmediate(resolve))
test('收支粒度按账号和业务隔离，收入默认周且拒绝旧存储的日', () => {
  const values = new Map(), storage = { getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value) }
  assert.deepEqual(modesFor('income').map(row => row.key), ['week', 'month', 'year'])
  assert.equal(readCalendarMode('income', 'a', storage), 'week')
  saveCalendarMode('expense', 'a', 'year', storage); saveCalendarMode('income', 'a', 'month', storage)
  assert.equal(readCalendarMode('expense', 'a', storage), 'year'); assert.equal(readCalendarMode('income', 'a', storage), 'month')
  assert.equal(readCalendarMode('expense', 'b', storage), 'day')
  saveCalendarMode('income', 'a', 'day', storage); assert.equal(readCalendarMode('income', 'a', storage), 'month')
  assert.equal(readCalendarMode('expense', 'a', { getStorageSync() { throw Error('denied') } }), 'day')
})
test('日历覆盖闰月、六行月和跨年切换，千位金额完整显示', () => {
  assert.equal(calendarPlaceholder(calendarScope('expense', 'day', '2024-02')).buckets.length, 29)
  const weeks = calendarPlaceholder(calendarScope('income', 'week', '2026-08')).buckets
  assert.equal(weeks.length, 6); assert.equal(weeks[0].startDate, '2026-08-01'); assert.equal(weeks[0].endDate, '2026-08-03')
  assert.equal(weeks[5].endDate, '2026-09-01')
  assert.equal(moveCalendarDate('2026-01', 'week', -1), '2025-12-01')
  assert.equal(moveCalendarDate('2026', 'month', -1), '2025-01-01')
  assert.equal(calendarScope('income', 'year', '2026-01').date, null)
  assert.equal(calendarMoney(1234.56, true), '1234.56')
  assert.equal(calendarMoney(2563, true), '2563')
})
test('明细请求使用半开区间，收入日期与支出日期时间契约分开', () => {
  const bucket = { startDate: '2026-08-31', endDate: '2026-09-01' }
  assert.deepEqual(detailQuery('income', bucket, 2), { page: 2, pageSize: 20, startTime: '2026-08-31', endTimeBefore: '2026-09-01' })
  assert.equal(detailQuery('expense', bucket).endTimeBefore, '2026-09-01 00:00:00')
  assert.deepEqual(detailQuery('income', { startDate: null, endDate: null }), { page: 1, pageSize: 20, undated: true })
})
test('共用摘要控制器隔离日历范围慢响应并在失败时保留旧范围', async () => {
  const state = summaryState(); let scope = calendarScope('income', 'week', '2026-08'), delayed = gate(), fail = false
  const controller = createSummaryController('income', state, { active: () => true, revision: () => 0, access: async () => ({ available: true }), query: () => scope, read: readCalendar, fetch: async () => {
    if (fail) throw Error('offline')
    if (scope.date === '2026-08') return delayed.promise
    return calendarPlaceholder(scope)
  } })
  const old = controller.refresh(); await tick()
  scope = calendarScope('income', 'month', '2026'); controller.invalidate(); await controller.refresh()
  delayed.resolve(calendarPlaceholder(calendarScope('income', 'week', '2026-08'))); await old
  assert.equal(state.data.granularity, 'month'); assert.equal(state.data.date, '2026')
  fail = true; scope = calendarScope('income', 'year'); controller.invalidate(); await controller.refresh()
  assert.equal(state.data.granularity, 'month'); assert.equal(state.error, 'offline')
})
test('明细触底去重、原页失败重试、末页停止与关闭后的响应隔离', async () => {
  const state = detailState(); let active = true, fail = true, calls = [], delayed = null
  const controller = createDetailsController(state, async page => {
    calls.push(page)
    if (delayed) return delayed.promise
    if (page === 2 && fail) throw Error('offline')
    return { items: page === 1 ? [{ id: '9223372036854775807' }] : [{ id: '9223372036854775807' }, { id: '2' }], total: '2' }
  }, () => active)
  await controller.load(); assert.equal(state.page, 1)
  await controller.load(); assert.equal(state.page, 1); assert.equal(state.items.length, 1); assert.equal(state.error, 'offline')
  fail = false; await controller.load(); assert.equal(state.page, 2); assert.equal(state.items.length, 2); assert.equal(state.hasMore, false)
  await controller.load(); assert.deepEqual(calls, [1, 2, 2])
  state.hasMore = true; delayed = gate(); const pending = controller.load(); const duplicate = controller.load(); await tick(); assert.equal(calls.length, 4)
  active = false; controller.invalidate(); delayed.resolve({ items: [{ id: 'late' }], total: 3 }); await Promise.all([pending, duplicate]); assert.equal(state.items.length, 2)
})
test('明细权限失效立即清空已展示记录，普通网络失败保留内容', async () => {
  const state = detailState(); let failure = null
  const controller = createDetailsController(state, async () => { if (failure) throw failure; return { items: [{ id: '1' }], total: 2 } }, () => true)
  await controller.load(); failure = Error('offline'); await controller.load(); assert.equal(state.items.length, 1)
  failure = Error('locked'); failure.name = 'SecondaryLockRequiredError'; await controller.load(); assert.equal(state.items.length, 0); assert.equal(state.page, 0)
})
test('概览共用周月年范围并校验三项汇总，零结余不丢失收支数据', () => {
  assert.equal(readCalendarMode('finance', 'owner', { getStorageSync: () => null }), 'week')
  assert.deepEqual(modesFor('finance').map(row => row.key), ['week', 'month', 'year'])
  const scope = calendarScope('finance', 'week', '2026-10'), data = calendarPlaceholder(scope)
  Object.assign(data.buckets[0], { income: 100, expense: 100, balance: 0, amount: 0 })
  assert.equal(readCalendar(data, scope).buckets[0].income, 100)
  delete data.buckets[0].balance
  assert.throws(() => readCalendar(data, scope))
})
test('切换明细类型保留旧列表，失败重试首屏并原子替换显示类型', async () => {
  const state = detailState(); let kind = 'expense', failed = false, displayed = 'expense'
  const controller = createDetailsController(state, async page => { if (failed) throw Error('offline'); return { items: [{ id: kind + '-1' }], total: 1, kind, page } }, () => true, result => { displayed = result.kind })
  await controller.load(); kind = 'income'; controller.reset(true); failed = true
  assert.equal(state.items[0].id, 'expense-1'); assert.equal(state.loaded, true)
  await controller.load(); assert.equal(displayed, 'expense'); assert.equal(state.items[0].id, 'expense-1'); assert.equal(state.page, 0)
  failed = false; await controller.load(); assert.equal(displayed, 'income'); assert.deepEqual(state.items.map(row => row.id), ['income-1']); assert.equal(state.page, 1)
})
