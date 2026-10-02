import { withFormRequired } from './helpers/form-required-source.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/profile-contract.ts', import.meta.url), 'utf8');
const { bindingPayload, readBindings, platforms } = await import(`data:text/javascript;base64,${Buffer.from(withFormRequired(source)).toString('base64')}`);

test('绑定保留长 ID，拒绝数字 ID，丢弃凭证和服务端元数据', () => {
  const id = '9223372036854775807';
  assert.deepEqual(readBindings([{ id, platform: 'github', platformUsername: 'demo', accessToken: 'secret-fixture', metaJson: '{}' }]), [{ id, platform: 'github', platformUsername: 'demo' }]);
  assert.throws(() => readBindings([{ id: 123, platform: 'github' }]), /绑定信息异常/);
});
test('编辑留空保留凭证，不能把旧平台凭证传到新平台', () => {
  assert.deepEqual(bindingPayload({ id: '99', platform: 'github', platformUsername: ' demo ', accessToken: ' ' }), { id: '99', platform: 'github', platformUsername: 'demo' });
  assert.deepEqual(bindingPayload({ platform: 'csdn', platformUsername: 'demo', accessToken: 'stale-fixture' }), { platform: 'csdn', platformUsername: 'demo' });
});
test('六个平台均有契约校验，微信读书新建必需 Key，编辑可保留', () => {
  for (const platform of platforms.filter(p => p.value !== 'weread')) assert.throws(() => bindingPayload({ platform: platform.value, platformUsername: ' ', accessToken: '' }), /请输入账号/);
  assert.throws(() => bindingPayload({ platform: 'weread', platformUsername: '', accessToken: '' }), /API Key/);
  assert.deepEqual(bindingPayload({ id: '9', platform: 'weread', platformUsername: '', accessToken: '' }), { id: '9', platform: 'weread', platformUsername: '' });
});
