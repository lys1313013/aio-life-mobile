import { withFormRequired } from './helpers/form-required-source.mjs';
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(withFormRequired(source)).toString('base64')}`)
const contractSource = await readFile(new URL('../src/services/records/contracts.ts', import.meta.url), 'utf8')
const { recordId, goalPayload, taskPayload, reordered, goalDateRange } = await importSource(contractSource)
const id = '9223372036854775807'
test('目标保留长 ID、父子关联、行动计划和标签，校验数值与日期', () => {
  const payload = goalPayload({ id, parentId: '9223372036854775806', title: ' 模拟读书 ', type: 3, status: 'in_progress', currentValue: '2', targetValue: '10', tags: '阅读，学习', content: '每日记录', startDate: '2026-10-01 00:00:00', endDate: '2026-10-31 23:59:59' })
  assert.equal(payload.id, id); assert.equal(payload.parentId, '9223372036854775806'); assert.equal(payload.content, '每日记录'); assert.equal(payload.tags, '["阅读","学习"]'); assert.equal(payload.currentValue, 2)
  assert.throws(() => recordId(9223372036854775807), /ID/)
  assert.throws(() => goalPayload({ ...payload, targetValue: '-1' }), /非负整数/)
  assert.throws(() => goalPayload({ ...payload, endDate: '2026-09-01 00:00:00' }), /结束时间/)
})
test('目标周期计算覆盖年末周、季度、半年、终生', () => {
  const now = new Date(2026, 11, 31)
  assert.deepEqual(goalDateRange(2, now), { startDate: '2026-12-27 00:00:00', endDate: '2027-01-02 23:59:59' })
  assert.deepEqual(goalDateRange(4, now), { startDate: '2026-10-01 00:00:00', endDate: '2026-12-31 23:59:59' })
  assert.equal(goalDateRange(5, now).startDate, '2026-07-01 00:00:00')
  assert.deepEqual(goalDateRange(10, now), { startDate: null, endDate: null })
})
test('待办排序只提交字符串 ID 和排序字段，越界不请求；明细关联保留', () => {
  const rows = [{ id, columnId: '8', content: '模拟甲' }, { id: '9', columnId: '8', content: '模拟乙' }]
  assert.deepEqual(reordered(rows, id, 1, 'task').payload, [{ id: '9', columnId: '8', sortOrder: 1 }, { id, columnId: '8', sortOrder: 2 }])
  assert.equal(reordered(rows, id, -1, 'task'), null)
  const detail = taskPayload({ id, taskId: '8', content: ' 模拟明细 ', priority: 1, isStarred: 1, isCompleted: 0, sort: 2 }, 'detail')
  assert.equal(detail.isStarred, 1); assert.equal(detail.sort, 2); assert.equal(detail.content, '模拟明细')
})
test('待办 API 使用真实 get 分页、PUT路径、数组排序、星标和批删契约', async () => {
  const calls = []; globalThis.__recordsRequest = async (...args) => { calls.push(args); return {} }
  let source = await readFile(new URL('../src/pages/tasks/services/tasks.ts', import.meta.url), 'utf8')
  source = source.replace("import { request } from '../../../services/api.ts'", 'const request = globalThis.__recordsRequest').replace("import { recordId } from '../../../services/records/contracts.ts'", `const recordId = ${recordId.toString()}`).replace(/request<any(?:\[\])?>/g, 'request')
  const api = await importSource(source)
  await api.fetchTasks(2); await api.saveTaskRecord('task', { id, columnId: '8', content: '模拟' }); await api.saveTaskRecord('detail', { id }); await api.sortTaskRecords('detail', [{ id, sort: 1 }]); await api.starDetail(id, false); await api.deleteGoal(id)
  assert.deepEqual(calls, [['/tasks', 'GET', { get: 2, pageSize: 100 }], ['/tasks/' + id, 'PUT', { id, columnId: '8', content: '模拟' }], ['/taskDetails', 'PUT', { id }], ['/taskDetails/reSort', 'POST', [{ id, sort: 1 }]], ['/taskDetails/unstar/' + id, 'POST'], ['/goals/batchDelete', 'POST', { idList: [id] }]])
  delete globalThis.__recordsRequest
})

test('会员快捷到期日期处理月末和闰年，金额与日期顺序校验', async () => {
  const { memberPayload, addMonthsClamped } = await importSource(contractSource)
  assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsClamped('2024-01-31', 1), '2024-02-29')
  assert.throws(() => memberPayload({ name: '模拟', startDate: '2026-10-02', expiryDate: '2026-10-01' }), /到期日期/)
  assert.throws(() => memberPayload({ name: '模拟', expiryDate: '2026-10-01', price: 'NaN' }), /金额/)
  assert.equal(memberPayload({ id, name: ' 模拟会员 ', expiryDate: '2026-10-01', price: '9.99' }).price, 9.99)
})
test('页面请求在离页或跨账号后失效，回页仍可再次操作', async () => {
  const { transformSync } = await import('esbuild')
  let scopeSource = await readFile(new URL('../src/services/records/page-scope.ts', import.meta.url), 'utf8')
  const hooks = {}, session = { token: 'mock-account-a' }
  globalThis.__scopeFixture = { hooks, session }
  scopeSource = scopeSource.replace(/^import .*$/gm, '')
  scopeSource = 'const currentPageAccess = () => ({ expired: false }); const session = globalThis.__scopeFixture.session; const onHide = fn => globalThis.__scopeFixture.hooks.hide = fn; const onShow = fn => globalThis.__scopeFixture.hooks.show = fn; const onUnmounted = fn => globalThis.__scopeFixture.hooks.unmount = fn;\n' + scopeSource
  const { createRecordScope } = await importSource(transformSync(scopeSource, { loader: 'ts', format: 'esm' }).code)
  const cleared = [], scope = createRecordScope(data => cleared.push(data))
  let resolve
  const stale = scope.wait(new Promise(r => { resolve = r }))
  hooks.hide(); resolve('old'); await assert.rejects(stale, error => error.name === 'PageInactiveError')
  hooks.show(); assert.equal(await scope.wait(Promise.resolve('new')), 'new')
  const switched = scope.wait(new Promise(r => { resolve = r })); session.token = 'mock-account-b'; resolve('old-account'); await assert.rejects(switched, error => error.name === 'PageInactiveError')
  hooks.show(); assert.deepEqual(cleared, [false, true]); hooks.unmount()
  await assert.rejects(scope.wait(Promise.resolve('disposed')), error => error.name === 'PageInactiveError')
  delete globalThis.__scopeFixture
})
