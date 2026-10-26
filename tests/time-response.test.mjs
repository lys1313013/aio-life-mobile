import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/services/time-response.ts', import.meta.url), 'utf8');
const { readDateRecords } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('单日接口只接收完整数组，保留字符串 ID', () => {
  const records = [{ id: '9223372036854775807', startTime: 0, endTime: 59 }];
  assert.deepEqual(readDateRecords(records), records);
  assert.deepEqual(readDateRecords([]), []);
  for (const data of [null, { items: records, total: 1 }, { items: [], total: 0 }]) {
    assert.throws(() => readDateRecords(data), /格式异常/);
  }
});
