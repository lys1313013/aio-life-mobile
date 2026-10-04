import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/services/time-response.ts', import.meta.url), 'utf8');
const { readDateRecords } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('单日接口兼容完整数组与线上 items 信封，保留字符串 ID', () => {
  const records = [{ id: '9223372036854775807', startTime: 0, endTime: 59 }];
  assert.deepEqual([...readDateRecords(records)], records);
  assert.deepEqual([...readDateRecords({ items: records, total: '1' })], records);
  assert.deepEqual(readDateRecords({ items: [], total: 0 }), []);
});

test('旧接口记录不完整或结构异常必须报错，不生成缺失记录的统计', () => {
  assert.throws(() => readDateRecords({ items: [], total: '2' }), /未完整返回/);
  assert.throws(() => readDateRecords({ items: [], total: 'invalid' }), /未完整返回/);
  assert.throws(() => readDateRecords(null), /格式异常/);
});
