import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/time-format.ts', import.meta.url), 'utf8');
const { periodRange, shiftDate, categoryPath, categoryMatches, validateRecord, recordMinutes, adjustRecordTime, durationEnd, elapsedSinceRecord, matchesCategories, distributionStats, trendPeriods, periodStatistics } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('日周月区间遵循周一开始、闰年、跨年及月底夹紧', () => {
  assert.deepEqual(periodRange('2026-01-01', 'week'), { start: '2025-12-29', end: '2026-01-04', days: 7 });
  assert.deepEqual(periodRange('2024-02-18', 'month'), { start: '2024-02-01', end: '2024-02-29', days: 29 });
  assert.equal(shiftDate('2026-03-31', -1, 'month'), '2026-02-28');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
});
test('分类筛选包含任意深度子分类，环不会死循环，保留大整数 ID', () => {
  const cats = [{ id: '9223372036854775807', name: '学习' }, { id: 'b', name: '阅读', parentId: '9223372036854775807' }, { id: 'c', name: '技术', parentId: 'b' }];
  assert.equal(categoryPath('c', cats), '学习 / 阅读 / 技术');
  assert.equal(categoryMatches('c', '9223372036854775807', cats), true);
  assert.equal(categoryMatches('b', 'c', cats), false);
  assert.equal(categoryMatches('c', 'x', [{ id: 'c', parentId: 'c' }]), false);
});
test('闭区间边界、相邻记录、跨日、编辑自排除及运动校验', () => {
  const record = { id: '1', date: '2026-09-30', categoryId: 'a', startTime: 60, endTime: 119 };
  assert.equal(recordMinutes(record), 60);
  assert.equal(validateRecord(record, [{ id: '2', startTime: 0, endTime: 59 }]), '');
  assert.match(validateRecord(record, [{ id: '2', startTime: 119, endTime: 120 }]), /重叠/);
  assert.equal(validateRecord(record, [record]), '');
  assert.match(validateRecord({ ...record, endTime: 1440 }, []), /不能跨天/);
  assert.match(validateRecord({ ...record, date: '2026-02-30' }, []), /有效日期/);
  assert.equal(recordMinutes({ startTime: 0, endTime: 1439 }), 1440);
  assert.equal(validateRecord({ ...record, startTime: 1439, endTime: 1439 }, []), '');
  assert.match(validateRecord({ ...record, exercises: [{ exerciseTypeId: '', exerciseCount: -1 }] }, []), /运动/);
});

test('Web 同口径快捷调时和小时分钟联动不跨相邻记录，23:10-23:33为24分钟', () => {
  const record = { id: '1', date: '2026-09-30', categoryId: 'a', startTime: 600, endTime: 659 };
  const existing = [{ id: '2', startTime: 540, endTime: 599 }, { id: '3', startTime: 680, endTime: 700 }];
  assert.equal(adjustRecordTime(record, existing, 'startTime', -30), 600);
  assert.equal(adjustRecordTime(record, existing, 'endTime', 30), 679);
  assert.equal(adjustRecordTime(record, existing, 'endTime', -100), 600);
  assert.equal(durationEnd(record, existing, 120), 679);
  assert.equal(recordMinutes({ startTime: 1390, endTime: 1413 }), 24);
  assert.equal(elapsedSinceRecord([{ startTime: 1390, endTime: 1413 }], 1433), 19);
  assert.equal(elapsedSinceRecord([], 100), null);
});


test('多分类父子交叉选择去重，默认按根分类汇总，选中后保留明细', () => {
  const categories = [{ id: 'a', name: '学习' }, { id: 'b', parentId: 'a', name: '阅读' }, { id: 'c', name: '运动' }];
  const records = [{ categoryId: 'a', startTime: 0, endTime: 29 }, { categoryId: 'b', startTime: 30, endTime: 59 }, { categoryId: 'c', startTime: 60, endTime: 69 }];
  assert.equal(matchesCategories('b', ['a', 'b'], categories), true);
  assert.equal(matchesCategories('c', ['a', 'b'], categories), false);
  assert.deepEqual(distributionStats(records, categories).map(r => [r.id, r.minutes]), [['a', 60], ['c', 10]]);
  assert.equal(distributionStats(records, categories, ['a', 'b']).reduce((n, r) => n + r.minutes, 0), 60);
});
test('十期趋势跨年、闰月完整，按全部记录日数计算筛选日均，空周期补零', () => {
  const periods = trendPeriods('2024-03-31', 'month');
  assert.equal(periods.length, 10);
  assert.deepEqual(periods.at(-2), { start: '2024-02-01', end: '2024-02-29', days: 29 });
  assert.equal(trendPeriods('2026-01-01', 'week').at(-1).start, '2025-12-29');
  const categories = [{ id: 'a', name: '学习' }, { id: 'b', name: '运动' }];
  const records = [{ date: '2024-02-01', categoryId: 'a', startTime: 0, endTime: 59 }, { date: '2024-02-02', categoryId: 'b', startTime: 0, endTime: 59 }];
  const result = periodStatistics(records, categories, ['a'], periods, true);
  assert.equal(result.at(-2).minutes, 30);
  assert.equal(result.at(-1).minutes, 0);
});
