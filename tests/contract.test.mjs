import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// .ts 中的纯 JS 契约逻辑直接执行；没有复制实现或替代平台编译。
const source = await readFile(new URL('../src/services/contract.ts', import.meta.url), 'utf8');
const { readResponse, readUser, validateCredentials } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('HTTP 200 业务错误必须使用后端 result，不能当作登录成功', () => {
  assert.throws(() => readResponse(200, { rscode: '113000', result: '用户名或密码错误' }), /用户名或密码错误/);
  assert.throws(() => readResponse(200, '<html>proxy error</html>'), /服务返回异常/);
  assert.throws(() => readResponse(200, { rscode: 0, data: {} }), /服务返回异常/);
});

test('纯文本 401 仍识别为登录过期，5xx 不泄漏服务端内容', () => {
  assert.throws(() => readResponse(401, '未授权'), (error) => error.name === 'SessionExpiredError');
  assert.throws(() => readResponse(500, { result: 'private stack' }), /服务暂时不可用/);
});

test('保留字符串长 ID，拒绝已发生精度风险的数字 ID', () => {
  const id = '9223372036854775807';
  const user = readUser(readResponse(200, { rscode: '0', data: { id, nickname: '测试用户' } }));
  assert.equal(user.id, id);
  assert.equal(user.name, '测试用户');
  assert.throws(() => readUser({ id: 123 }), /用户信息异常/);
});

test('账号去空白检查，密码原样保留', () => {
  assert.equal(validateCredentials('  ', 'secret'), '请输入账号');
  assert.equal(validateCredentials('test', ''), '请输入密码');
  assert.equal(validateCredentials(' test ', ' pass '), '');
});
