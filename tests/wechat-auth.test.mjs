import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const contractSource = await readFile(new URL('../src/services/contract.ts', import.meta.url), 'utf8');
const { readWechatLogin, readPhoneCode, readResponse } = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
const source = (await readFile(new URL('../src/services/wechat-auth.ts', import.meta.url), 'utf8'))
  .replace(/^import .+$/gm, '')
  .replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
  .replace(/export /g, '');
const createService = new Function('request', 'readWechatLogin', 'saveToken', 'uni', source + '\nreturn { startWechatLogin, loginWithWechatPhone, bindWechatAccount, initializeWechatPassword };');
const loggedIn = { status: 'LOGGED_IN', id: '9223372036854775807', accessToken: 'final-token', hasPassword: true, accountUsername: 'fixture-user' };
const pending = { status: 'PHONE_REQUIRED', loginTicket: 'fixture-ticket', expiresIn: 300 };

function fixture(request) {
  const saved = [];
  const service = createService(request, readWechatLogin, (token) => saved.push(token), {
    login({ success }) { success({ code: 'fixture-login-code' }); },
  });
  return { service, saved };
}

test('待授权票据不能作为业务 Token 保存', async () => {
  const { service, saved } = fixture(async (path, method, body) => {
    assert.equal(path, '/auth/wechat/mini/login');
    assert.deepEqual(body, { loginCode: 'fixture-login-code' });
    return pending;
  });
  assert.equal((await service.startWechatLogin()).status, 'PHONE_REQUIRED');
  assert.deepEqual(saved, []);
});

test('手机号授权使用 phoneCode，只有完成登录才保存 Token', async () => {
  const { service, saved } = fixture(async (path, method, body) => {
    assert.equal(path, '/auth/wechat/mini/phone-login');
    assert.deepEqual(body, { loginTicket: 'ticket', phoneCode: 'phone-code' });
    return loggedIn;
  });
  await service.loginWithWechatPhone('ticket', 'phone-code');
  assert.deepEqual(saved, ['final-token']);
});

test('手机号命中已有账号时不保存登录态', async () => {
  const { service, saved } = fixture(async () => ({ ...pending, status: 'BIND_REQUIRED' }));
  await service.loginWithWechatPhone('ticket', 'phone-code');
  assert.deepEqual(saved, []);
});

test('绑定只保存最终 Token，并注销验证原账号的临时会话', async () => {
  const calls = [];
  const { service, saved } = fixture(async (...args) => {
    calls.push(args);
    if (args[0] === '/auth/login') return { accessToken: 'temporary-token' };
    if (args[0] === '/auth/wechat/mini/bind') {
      assert.equal(args[4], 'temporary-token');
      assert.equal(args[2].password, ' pass ');
      return loggedIn;
    }
  });
  await service.bindWechatAccount('ticket', ' user ', ' pass ');
  assert.deepEqual(saved, ['final-token']);
  assert.equal(calls[0][2].username, 'user');
  assert.equal(calls.at(-1)[0], '/auth/logout');
  assert.equal(calls.at(-1)[4], 'temporary-token');
});

test('绑定冲突不保存原账号会话且仍清理临时 Token', async () => {
  let loggedOut = false;
  const { service, saved } = fixture(async (path) => {
    if (path === '/auth/login') return { accessToken: 'temporary-token' };
    if (path === '/auth/wechat/mini/bind') throw new Error('绑定冲突');
    if (path === '/auth/logout') loggedOut = true;
  });
  await assert.rejects(service.bindWechatAccount('ticket', 'user', 'password'), /绑定冲突/);
  assert.deepEqual(saved, []);
  assert.equal(loggedOut, true);
});

test('取消授权和额度不足有可读提示，不发送无效手机号 code', () => {
  assert.throws(() => readPhoneCode({ errMsg: 'getPhoneNumber:fail user deny' }), /未完成手机号授权/);
  assert.throws(() => readPhoneCode({ errno: 1400001 }), /额度暂不可用/);
  assert.equal(readPhoneCode({ code: 'phone-code' }), 'phone-code');
});

test('拒绝缺少 Token、数字 ID、未知状态及无效票据期限', () => {
  assert.throws(() => readWechatLogin({ ...loggedIn, accessToken: '' }), /结果异常/);
  assert.throws(() => readWechatLogin({ ...loggedIn, id: 123 }), /结果异常/);
  assert.throws(() => readWechatLogin({ status: 'unknown' }), /结果异常/);
  assert.throws(() => readWechatLogin({ ...pending, expiresIn: 0 }), /结果异常/);
});

test('409 和 429 展示结构化业务错误，网关原文仍不泄漏', () => {
  assert.throws(() => readResponse(409, { rscode: '100400', result: '绑定冲突' }), /绑定冲突/);
  assert.throws(() => readResponse(429, { rscode: '100400', result: '操作过于频繁' }), /操作过于频繁/);
  assert.throws(() => readResponse(502, { rscode: '113000', result: 'private upstream' }), /服务暂时不可用/);
});
