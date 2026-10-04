import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = (await readFile(new URL('../src/services/wechat-web-login.ts', import.meta.url), 'utf8'))
  .replace(/^import .+$/gm, '').replace(/export /g, '');
const create = new Function('request', 'getWechatCode', 'Date', source + '\nreturn { rememberWebLoginScene, clearWebLoginScene, webLoginReturnPath, scanWebLogin, confirmWebLogin, cancelWebLogin };');
const scene = 'a'.repeat(32);

test('注册登录后只返回本次扫码确认页，拒绝外部地址及畸形scene', () => {
  let now = 1000;
  const service = create(null, null, { now: () => now });
  assert.equal(service.rememberWebLoginScene(scene), scene);
  assert.equal(service.webLoginReturnPath(), '/pages/auth/web-login?scene=' + scene);
  now += 300001;
  assert.equal(service.webLoginReturnPath(), '');
  for (const value of ['https://evil.example', '%', '../home/index', 'a'.repeat(33), null]) {
    assert.equal(service.rememberWebLoginScene(value), '');
    assert.equal(service.webLoginReturnPath(), '');
  }
  service.rememberWebLoginScene(scene);
  service.clearWebLoginScene();
  assert.equal(service.webLoginReturnPath(), '');
});

test('扫码不自动确认；确认需要新鲜微信code且不携带浏览器密钥', async () => {
  const calls = [];
  let codes = 0;
  const service = create(async (...args) => { calls.push(args); return { status: 'SCANNED' }; },
    async () => { codes++; return 'fresh-code'; }, Date);
  await service.scanWebLogin(scene);
  assert.equal(codes, 0);
  assert.deepEqual(calls[0], ['/auth/wechat/web/scan', 'POST', { scene }]);
  await service.confirmWebLogin(scene);
  assert.equal(codes, 1);
  assert.deepEqual(calls[1], ['/auth/wechat/web/confirm', 'POST', { scene, loginCode: 'fresh-code' }]);
  await service.cancelWebLogin(scene);
  assert.deepEqual(calls[2], ['/auth/wechat/web/cancel', 'POST', { scene }]);
});

test('微信凭证获取失败不请求确认接口', async () => {
  const service = create(() => assert.fail('不得发送确认请求'), async () => { throw new Error('wx failed'); }, Date);
  await assert.rejects(service.confirmWebLogin(scene), /wx failed/);
});
