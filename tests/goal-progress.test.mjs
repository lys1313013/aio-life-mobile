import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/services/goal-progress.ts', import.meta.url), 'utf8');
const { goalProgressPercent, goalDisplayStatus, refreshGoalRows } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const base = { progressMode: 'graphql', progressCheckedAt: '2026-11-03 10:00:00', status: 'in_progress' };
test('三类进度、严格超过边界和失败保留成功状态', () => {
  assert.equal(goalProgressPercent({ ...base, currentValue: 26, targetValue: 40 }), 65);
  assert.equal(goalProgressPercent({ ...base, currentValue: 25, targetValue: 100, targetOperator: 'gt' }), 25);
  assert.equal(goalProgressPercent({ ...base, currentValue: 100, targetValue: 100, targetOperator: 'gt' }), 99);
  assert.equal(goalDisplayStatus({ ...base, currentValue: 100, targetValue: 100, targetOperator: 'gt' }), 'in_progress');
  assert.equal(goalDisplayStatus({ ...base, currentValue: 101, targetValue: 100, targetOperator: 'gt' }), 'completed');
  assert.equal(goalDisplayStatus({ ...base, currentValue: 15000.25, targetValue: 15000, progressError: '刷新失败' }), 'completed');
});
test('每批最多十条，手动目标不请求，失败保留值，不吞掉账号变化', async () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ ...base, id: String(9000 + i), currentValue: 25 }));
  rows.push({ id: 'manual', progressMode: 'manual', currentValue: 3 });
  const calls = [];
  const result = await refreshGoalRows(rows, async (path, method, payload) => { calls.push({ path, method, payload }); throw Error('连接失败'); });
  assert.equal(calls.length, 2); assert.equal(calls[0].payload.ids.length, 10);
  assert.equal(result[0].currentValue, 25); assert.equal(result[0].progressError, '连接失败');
  assert.equal(result.at(-1).progressError, undefined);
  await assert.rejects(refreshGoalRows(rows, async () => { throw Object.assign(Error('账号变化'), { name: 'StaleSessionError' }); }), /账号变化/);
  let active = true;
  await assert.rejects(refreshGoalRows(rows, async () => { active = false; return []; }, () => active), error => error.name === 'PageInactiveError');
});
