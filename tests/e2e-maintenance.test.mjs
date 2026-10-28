import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import maintenance from '../scripts/check-e2e-maintenance.cjs';

test('E2E 统一诊断入口和历史脆弱写法预算保持一致', () => {
  assert.deepEqual(maintenance.check(fileURLToPath(new URL('..', import.meta.url))), []);
});
