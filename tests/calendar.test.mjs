import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
const source = await readFile('src/services/calendar.ts', 'utf8');
const { calendarMonth, validCalendarDate, calendarBounds, calendarPeriodAllowed } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64'));

test('月历按周一排列，闰年和跨年日期保持完整', () => {
  const february = calendarMonth(2024, 2);
  assert.equal(february.length, 42);
  assert.equal(february[0].value, '2024-01-29');
  assert.equal(february.filter(day => !day.outside).length, 29);
  assert.equal(calendarMonth(2025, 2).filter(day => !day.outside).length, 28);
  assert.equal(calendarMonth(2026, 12).at(-1).value, '2027-01-10');
  assert.equal(validCalendarDate('2025-02-29'), false);
  assert.equal(validCalendarDate('2024-02-29'), true);
  assert.equal(validCalendarDate('2026-13-01'), false);
  assert.equal(validCalendarDate('9999-12-31'), true);
  assert.equal(validCalendarDate('10000-01-01'), false);
});
test('月选择范围扩展到月底，边界日期可选，越界与倒置范围不可选', () => {
  assert.deepEqual(calendarBounds('2024-02', '2024-02', 'month'), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(calendarPeriodAllowed('2024-02-29', '2024-02-29', '2024-02-01', '2024-02-29'), true);
  assert.equal(calendarPeriodAllowed('2024-03-01', '2024-03-01', '2024-02-01', '2024-02-29'), false);
  assert.equal(calendarPeriodAllowed('2024-02-01', '2024-02-29', '2024-03-01', '2024-02-01'), false);
  assert.deepEqual(calendarBounds('', '', 'day'), { start: '1000-01-01', end: '9999-12-31' });
});
