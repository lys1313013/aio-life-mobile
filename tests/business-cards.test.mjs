import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

const source = await readFile(new URL('../src/pages/home/services/business-cards.ts', import.meta.url), 'utf8')
const { businessCards, cardState, loadBusinessCard, failBusinessAccess, cardRows, sortMemberships } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const read = businessCards.find(card => card.key === 'read')
const goal = businessCards.find(card => card.key === 'goal')
const row = id => ({ id: String(id), status: 'in_progress' })
const page = (items, total = 60) => ({ items, total })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('真实 PageResp items 契约和旧后端固定/状态筛选失败时拒绝展示', () => {
  assert.deepEqual(cardRows(read, page([row(1)])), [row(1)])
  assert.throws(() => cardRows(read, { records: [row(1)], total: 1 }), /数据异常/)
  assert.throws(() => cardRows(goal, [{ id: '1' }]), /尚未就绪/)
  assert.throws(() => cardRows(goal, [{ id: '1', isPinned: 0 }]), /尚未就绪/)
  assert.throws(() => cardRows(read, page([{ id: '1', status: 'completed' }])), /尚未就绪/)
  assert.deepEqual(cardRows(goal, [{ id: '1', isPinned: 1 }]), [{ id: '1', isPinned: 1 }])
})

test('分页去重、请求去重、失败保留旧列表和页码并重试同页', async () => {
  const state = cardState(), pending = deferred(), paths = []
  await loadBusinessCard(read, state, async () => page([row(1), row(1), row(2)]))
  assert.deepEqual(state.rows.map(item => item.id), ['1', '2'])
  const running = loadBusinessCard(read, state, path => { paths.push(path); return pending.promise }, true)
  await loadBusinessCard(read, state, async () => { throw Error('重复调用') }, true)
  pending.resolve(page([row(2), row(3), row(3)])); await running
  assert.deepEqual(state.rows.map(item => item.id), ['1', '2', '3'])
  assert.equal(paths.length, 1)
  await loadBusinessCard(read, state, async path => { paths.push(path); throw Error('连接失败') }, true)
  assert.equal(state.page, 2); assert.equal(state.moreError, '连接失败')
  assert.deepEqual(state.rows.map(item => item.id), ['1', '2', '3'])
  await loadBusinessCard(read, state, async path => { paths.push(path); return page([row(4)], 61) }, true)
  assert.equal(paths.at(-1), paths.at(-2)); assert.match(paths.at(-1), /current=3/)
  assert.equal(state.page, 3); assert.equal(state.moreError, '')
})

test('刷新使旧分页响应失效，旧 finally 不清除新请求 loading', async () => {
  const state = cardState(), stale = deferred(), fresh = deferred()
  await loadBusinessCard(read, state, async () => page([row(1)]))
  const older = loadBusinessCard(read, state, () => stale.promise, true)
  const newer = loadBusinessCard(read, state, () => fresh.promise)
  stale.resolve(page([row(2)])); await older
  assert.equal(state.loading, true); assert.deepEqual(state.rows.map(item => item.id), ['1'])
  fresh.resolve(page([row(8)], 1)); await newer
  assert.deepEqual(state.rows.map(item => item.id), ['8']); assert.equal(state.page, 1)
})

test('末页、空页、整页重复均停止继续分页', async () => {
  for (const data of [page([row(2)], 21), page([], 100), page([row(1)], 100)]) {
    const state = cardState()
    await loadBusinessCard(read, state, async () => page([row(1)], 100))
    await loadBusinessCard(read, state, async () => data, true)
    assert.equal(state.more, false)
    await loadBusinessCard(read, state, async () => { assert.fail('终止后不得再请求') }, true)
  }
})

test('二级锁响应清除已有数据，过期响应无法回填', async () => {
  const state = cardState(), stale = deferred()
  await loadBusinessCard(read, state, async () => page([row(1)]))
  const pending = loadBusinessCard(read, state, () => stale.promise, true)
  await loadBusinessCard(read, state, async () => { const error = Error('已锁定'); error.name = 'SecondaryLockRequiredError'; throw error })
  stale.resolve(page([row(2)])); await pending
  assert.deepEqual(state.rows, []); assert.equal(state.locked, true); assert.equal(state.more, false)
})

test('离页/会话失效版本变化后旧请求不再写回', async () => {
  const state = cardState(), pending = deferred()
  const running = loadBusinessCard(read, state, () => pending.promise)
  Object.assign(state, cardState(), { version: state.version + 1 })
  pending.resolve(page([row(1)])); await running
  assert.deepEqual(state.rows, []); assert.equal(state.loaded, false)
})

test('首页会员过滤过期和缺失到期日，保留今天到期并按到期日与完整 ID 排序', () => {
  const rows = [
    { id: '9', expiryDate: '2026-09-01', status: 'expired' }, { id: '8', expiryDate: '2026-10-03', status: 'active' },
    { id: '7', expiryDate: null }, { id: '4', expiryDate: '2026-10-04', status: 'expiring' },
    { id: '6', expiryDate: '2026-10-05' }, { id: '5', expiryDate: '2026-10-05' },
    { id: '9007199254740992', expiryDate: '2026-10-05' }, { id: '9007199254740993', expiryDate: '2026-10-05' },
    { id: '3', expiryDate: '2026-10-06', status: 'expired' },
  ]
  const original = structuredClone(rows)
  const today = new Date(2026, 9, 4, 23, 59, 59)
  const result = sortMemberships(rows, today)
  assert.deepEqual(result.map(item => item.id), ['4', '9007199254740993', '9007199254740992', '6', '5'])
  assert.deepEqual(sortMemberships([rows[0], rows[1], rows[8]], today), [])
  assert.deepEqual(rows, original)
})

test('菜单依赖请求失败保留列表和页码，明确二级锁才清除内容', () => {
  const state = { ...cardState(), rows: [row(1)], page: 3, more: true, loaded: true, loading: true }
  failBusinessAccess(state, Error('网络失败'))
  assert.deepEqual(state.rows, [row(1)]); assert.equal(state.page, 3); assert.equal(state.more, true)
  assert.equal(state.loaded, true); assert.equal(state.loading, false); assert.equal(state.error, '网络失败')
  const lock = Error('需要解锁'); lock.name = 'SecondaryLockRequiredError'
  failBusinessAccess(state, lock)
  assert.deepEqual(state.rows, []); assert.equal(state.locked, true); assert.equal(state.more, false)
})
