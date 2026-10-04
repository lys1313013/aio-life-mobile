import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const contractSource = await readFile(new URL('../src/services/contract.ts', import.meta.url), 'utf8');
const { readWechatLogin, readResponse } = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
const source = (await readFile(new URL('../src/services/wechat-auth.ts', import.meta.url), 'utf8'))
  .replace(/^import .+$/gm, '')
  .replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
  .replace(/export /g, '');
const createService = new Function('request', 'readWechatLogin', 'saveToken', 'uni', source + '\nreturn { fetchWechatCapabilities, startWechatLogin, registerWithWechat, bindWechatAccount, initializeWechatPassword };');
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

test('微信注册只提交服务端票据，成功后保存业务 Token', async () => {
  const { service, saved } = fixture(async (path, method, body, auth) => {
    assert.equal(path, '/auth/wechat/mini/register');
    assert.equal(method, 'POST');
    assert.equal(auth, false);
    assert.deepEqual(body, { loginTicket: 'ticket' });
    return loggedIn;
  });
  await service.registerWithWechat('ticket');
  assert.deepEqual(saved, ['final-token']);
});

test('旧后端未声明注册能力时隐藏微信直接注册入口', async () => {
  const old = fixture(async () => ({ enabled: true })).service;
  assert.deepEqual(await old.fetchWechatCapabilities(), { enabled: true, registrationEnabled: false });
  const current = fixture(async () => ({ enabled: true, registrationEnabled: true })).service;
  assert.deepEqual(await current.fetchWechatCapabilities(), { enabled: true, registrationEnabled: true });
});

test('微信注册失败不写入登录态', async () => {
  const { service, saved } = fixture(async () => { throw new Error('票据失效'); });
  await assert.rejects(service.registerWithWechat('expired'), /票据失效/);
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
