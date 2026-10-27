import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';
const source = (await readFile(new URL('../src/services/legal.ts', import.meta.url), 'utf8')).replace(/^import .+$/gm, '');
const { code } = await transformWithEsbuild(source, 'legal.ts', { loader: 'ts', target: 'es2022' });
const createService = new Function('request', 'uni', code.replace(/export /g, '') + '\nreturn {fetchLegalPolicies, registrationConsent, openLegalPolicy};');
const policy = { version: '2026-10-27', effectiveDate: '2026-10-27', operator: 'Fixture Operator', contactEmail: 'privacy@example.test', privacy: [['信息用途', '模拟内容']], terms: [['服务条款', '模拟内容']] };
test('未同意或未加载协议不得构造注册同意，发送明确版本', () => {
  const service = createService(() => {}, {});
  assert.throws(() => service.registrationConsent(false, policy.version), /同意/);
  assert.throws(() => service.registrationConsent(true, ''), /同意/);
  assert.deepEqual(service.registrationConsent(true, policy.version), { agreedPolicy: true, policyVersion: policy.version });
});
test('匿名读取后端当前政策，失败或格式异常不退回旧政策', async () => {
  const valid = createService(async (...args) => { assert.deepEqual(args, ['/auth/legal', 'GET', null, false]); return policy; }, {});
  assert.deepEqual(await valid.fetchLegalPolicies(), policy);
  const invalid = createService(async () => ({ ...policy, privacy: ['bad'] }), {});
  await assert.rejects(invalid.fetchLegalPolicies(), /加载失败/);
  const failed = createService(async () => { throw Error('fixture unavailable'); }, {});
  await assert.rejects(failed.fetchLegalPolicies(), /unavailable/);
});
