import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import { formRequiredUrl, withFormRequired } from './helpers/form-required-source.mjs';

const { isRequired, missingRequired, requiredFields } = await import(formRequiredUrl);
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code } = await transform(withFormRequired(source), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('必填只拒绝缺失和空白，金额 0、布尔 false 和密码原文不丢失', () => {
  for (const amt of [0, '0', false]) {
    assert.equal(missingRequired('income', { amt, incDate: '2026-10-03' }), false);
  }
  for (const amt of [undefined, null, '', '  ']) {
    assert.equal(missingRequired('income', { amt, incDate: '2026-10-03' }), true);
  }
  assert.equal(missingRequired('password', { oldPassword: ' old ', password: ' ', confirm: ' ' }), false);
  assert.equal(isRequired('member', 'price'), false);
  assert.equal(isRequired('exercise', 'exerciseCount'), false);
});

test('订阅标记字段与实际保存校验一致，非必填金额保留 null 和 0', async () => {
  const { memberPayload } = await load('../src/services/records/contracts.ts');
  const form = { name: '模拟订阅', expiryDate: '2026-12-01', price: 0, monthlyAmount: '' };
  for (const field of requiredFields('member')) {
    assert.equal(isRequired('member', field), true);
    assert.throws(() => memberPayload({ ...form, [field]: '  ' }), /名称和到期日期/);
  }
  assert.equal(memberPayload(form).price, 0);
  assert.equal(memberPayload(form).monthlyAmount, null);
});

test('绑定凭证根据平台和新增编辑状态切换，编辑留空不覆盖凭证', async () => {
  const { bindingPayload } = await load('../src/services/profile-contract.ts');
  const form = { platform: 'weread', platformUsername: '', accessToken: '' };
  assert.equal(isRequired('binding', 'accessToken', form), true);
  assert.equal(isRequired('binding', 'platformUsername', form), false);
  assert.throws(() => bindingPayload(form), /API Key/);
  const edit = { ...form, id: '9' };
  assert.equal(isRequired('binding', 'accessToken', edit), false);
  assert.equal('accessToken' in bindingPayload(edit), false);
  assert.equal(isRequired('binding', 'platformUsername', { platform: 'github' }), true);
  assert.equal(isRequired('binding', 'accessToken', { platform: 'github' }), false);
});

test('银行卡二选一、二级密码恢复与初次设置的标记随条件变化', () => {
  assert.equal(missingRequired('card', { bankId: '', customBankName: '' }), true);
  assert.equal(missingRequired('card', { bankId: '', customBankName: '模拟银行' }), false);
  assert.equal(missingRequired('card', { bankId: '9', customBankName: '' }), false);
  assert.equal(isRequired('card', 'customBankName', { bankId: '9' }), false);
  assert.deepEqual(requiredFields('security', { mode: 'menus' }), ['password']);
  assert.deepEqual(requiredFields('security', { mode: 'recovery' }), ['password', 'confirmation', 'code']);
  assert.equal(isRequired('security', 'oldPassword', { mode: 'password', hasPassword: true }), true);
  assert.equal(isRequired('security', 'oldPassword', { mode: 'password', hasPassword: false }), false);
  assert.equal(isRequired('vaultUnlock', 'confirm', { initialized: true }), false);
});

test('MCP 根 schema 引用的必填标记与执行校验一致，嵌套 required 不被覆盖', async () => {
  const { toolFields, buildToolArguments } = await load('../src/pages/mcp/services/mcp-schema.ts');
  const schema = { $ref: '#/$defs/input', $defs: { input: {
    type: 'object', required: ['enabled', 'count', 'options'], properties: {
      enabled: { type: 'boolean' }, count: { type: 'number' },
      options: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      note: { type: 'string' },
    },
  } } };
  const fields = toolFields(schema);
  assert.deepEqual(fields.filter(field => field.isRequired).map(field => field.name), ['enabled', 'count', 'options']);
  assert.deepEqual(fields.find(field => field.name === 'options').required, ['name']);
  assert.throws(() => buildToolArguments(schema, { count: 0, options: '{"name":"模拟"}' }), /enabled/);
  assert.deepEqual(buildToolArguments(schema, { enabled: false, count: 0, options: '{"name":"模拟"}' }), {
    enabled: false, count: 0, options: { name: '模拟' },
  });
});
