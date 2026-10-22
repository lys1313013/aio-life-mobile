import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const code = (await transform(await readFile(new URL('../src/pages/home/services/summary-cards.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })).code
const { summaryState, createSummaryController, readSummary, summaryEntry, summaryMonth } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const row = id => ({ items: [{ id, title: id }], refreshInterval: 300 })
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { resolve, promise } }
function fixture(key = 'memo') {
  const state = summaryState(); let active = true, revision = 0, calls = 0, next = row('9223372036854775807'), allowed = { available: true }
  const controller = createSummaryController(key, state, { active: () => active, revision: () => revision, access: async () => allowed, fetch: async () => { calls++; return await next } })
  return { state, controller, calls: () => calls, set: value => { next = value }, lock: () => { allowed = { available: true, locked: true } }, deny: () => { allowed = { available: false } }, write: () => revision++, leave: () => { active = false; controller.invalidate() } }
}
test('笔记只保留摘要和字符串 ID，重复数据去重，正文永不进入首页状态', () => {
  const result = readSummary('memo', { items: [{ id: '9223372036854775807', title: '笔记', content: '秘密', hiddenContent: true }, { id: '9223372036854775807', title: '重复' }], refreshInterval: 300 })
  assert.equal(result.items.length, 1); assert.equal(result.items[0].id, '9223372036854775807'); assert.equal('content' in result.items[0], false)
  assert.throws(() => readSummary('memo', { items: [{ id: 123 }], refreshInterval: 300 }))
})
test('刷新去重、返回复用缓存、写入后失效刷新', async () => {
  const f = fixture(); const pending = gate(); f.set(pending.promise)
  const first = f.controller.refresh(); const second = f.controller.refresh(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls(), 1)
  pending.resolve(row('first')); await Promise.all([first, second]); await f.controller.refresh(false); assert.equal(f.calls(), 1)
  f.write(); f.set(row('updated')); await f.controller.refresh(false); assert.equal(f.calls(), 2); assert.equal(f.state.data.items[0].id, 'updated')
})
test('失败保留已有内容与空态；锁与无权限清除敏感内容且不请求摘要', async () => {
  const f = fixture(); await f.controller.refresh(); f.set(Promise.reject(Error('offline'))); await f.controller.refresh()
  assert.equal(f.state.error, 'offline'); assert.equal(f.state.data.items.length, 1)
  f.lock(); await f.controller.refresh(); assert.equal(f.state.data, null); assert.equal(f.state.locked, true); assert.equal(f.calls(), 2)
  const denied = fixture(); denied.deny(); await denied.controller.refresh(); assert.equal(denied.calls(), 0); assert.equal(denied.state.available, false)
})
test('离页和写入之后的旧响应不回填，旧 finally 不影响新生命周期', async () => {
  const f = fixture(); const pending = gate(); f.set(pending.promise); const task = f.controller.refresh(); await new Promise(resolve => setImmediate(resolve)); f.leave(); pending.resolve(row('late')); await task
  assert.equal(f.state.data, null); assert.equal(f.state.loading, false)
  const written = fixture(); const old = gate(); written.set(old.promise); const beforeWrite = written.controller.refresh(); await new Promise(resolve => setImmediate(resolve)); written.write(); written.set(row('fresh')); old.resolve(row('stale')); await beforeWrite; await new Promise(resolve => setImmediate(resolve)); assert.equal(written.state.data.items[0].id, 'fresh')
})
test('财务跨月返回强制更新，金额为数字且零金额有效', async () => {
  const f = fixture('finance'); f.set({ month: '2020-01', income: 0, expense: 0, balance: 0, refreshInterval: 300 }); await f.controller.refresh()
  f.set({ month: summaryMonth(), income: 1, expense: 2, balance: -1, refreshInterval: 300 }); await f.controller.refresh(false); assert.equal(f.calls(), 2); assert.equal(f.state.data.balance, -1)
  assert.throws(() => readSummary('finance', { month: summaryMonth(), income: '0', expense: 0, balance: 0, refreshInterval: 300 }))
})
test('摘要跳转精确保留长 ID 与笔记模式', () => {
  assert.equal(summaryEntry('memo', '9223372036854775807'), '/pages/records/notes?kind=memo&id=9223372036854775807')
  assert.equal(summaryEntry('device', '9223372036854775807'), '/pages/goods/devices?id=9223372036854775807')
})
test('摘要刷新权限撤销后立即清除数据，无效周期不阻止业务数据展示', async () => {
  const f = fixture(); await f.controller.refresh(); const error = Error('无权限'); error.name = 'ForbiddenError'; f.set(Promise.reject(error)); await f.controller.refresh(); assert.equal(f.state.data, null); assert.equal(f.state.available, false)
  assert.equal(readSummary('memo', { items: [], refreshInterval: null }).items.length, 0)
  assert.equal(summaryMonth(new Date('2026-10-31T16:00:00Z')), '2026-11')
})

test('三张财务卡范围隔离：慢本年不会覆盖全部，失败保留原范围与金额', async () => {
  const state = summaryState(), pendingYear = gate(); let fail = false; const paths = []
  const controller = createSummaryController('income', state, { active: () => true, revision: () => 0, access: async () => ({ available: true }), fetch: async path => {
    paths.push(path); const period = path.split('period=')[1]
    if (period === 'year') return pendingYear.promise
    if (fail) throw Error('offline')
    return { period, label: period === 'all' ? '全部' : '2026年10月', amount: period === 'all' ? 300 : 100, refreshInterval: 300 }
  } })
  await controller.refresh(); const year = controller.setPeriod('year'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.data.period, 'month'); assert.equal(state.data.amount, 100)
  await controller.setPeriod('all'); assert.equal(state.data.period, 'all'); assert.equal(state.data.amount, 300)
  pendingYear.resolve({ period: 'year', label: '2026年', amount: 200, refreshInterval: 300 }); await year; assert.equal(state.data.period, 'all')
  await controller.setPeriod('month'); assert.equal(paths.length, 3); assert.equal(state.data.amount, 100)
  fail = true; await controller.refresh(); assert.equal(state.data.period, 'month'); assert.equal(state.data.amount, 100); assert.equal(state.error, 'offline')
})
test('写入失效覆盖已缓存的所有范围，收入支出只读取amount，金额0有效', async () => {
  let revision = 0, calls = 0; const state = summaryState()
  const controller = createSummaryController('expense', state, { active: () => true, revision: () => revision, access: async () => ({ available: true }), fetch: async path => { calls++; return { period: path.split('period=')[1], label: '范围', amount: revision, refreshInterval: 300 } } })
  await controller.refresh(); await controller.setPeriod('all'); revision++; await controller.setPeriod('month'); assert.equal(state.data.amount, 1); await controller.setPeriod('all'); assert.equal(state.data.amount, 1); assert.equal(calls, 4)
  assert.deepEqual(Object.keys(readSummary('income', { period: 'all', label: '全部', amount: 0, refreshInterval: 300 })).sort(), ['period', 'label', 'month', 'amount', 'refreshInterval'].sort())
})
test('北京年月边界按范围计算，全部范围不随日历变化', async () => {
  const { summaryPeriodKey } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  assert.equal(summaryPeriodKey('month', new Date('2026-12-31T16:00:00Z')), '2027-01')
  assert.equal(summaryPeriodKey('year', new Date('2026-12-31T16:00:00Z')), '2027')
  assert.equal(summaryPeriodKey('all', new Date('2026-12-31T16:00:00Z')), 'all')
})
