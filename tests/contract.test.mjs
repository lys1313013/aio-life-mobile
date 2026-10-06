import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// .ts 中的纯 JS 契约逻辑直接执行；没有复制实现或替代平台编译。
const source = await readFile(new URL('../src/services/contract.ts', import.meta.url), 'utf8');
const { readResponse, readUser, validateCredentials } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('HTTP 200 业务错误必须使用后端 message，不能当作登录成功', () => {
  assert.throws(() => readResponse(200, { code: 113000, message: '用户名或密码错误' }), /用户名或密码错误/);
  assert.throws(() => readResponse(200, '<html>proxy error</html>'), /服务返回异常/);
  assert.throws(() => readResponse(200, { code: '0', data: {} }), /服务返回异常/);
});

test('整数成功码解包数据，可空字段保留，错误契约不能被当成成功', () => {
  const data = { id: '9223372036854775807' };
  assert.equal(readResponse(200, { code: 0, message: null, data }), data);
  assert.equal(readResponse(200, { code: 0, message: null, data: null }), null);
  for (const code of [undefined, null, '0', false, NaN, Infinity, 0.5]) {
    assert.throws(() => readResponse(200, { code, message: null, data }), /服务返回异常/);
  }
  assert.throws(() => readResponse(200, { rscode: '0', result: null, data }), /服务返回异常/);
  assert.throws(() => readResponse(400, { code: 100400, message: '参数错误', data: null }), /参数错误/);
});

test('数字二级锁错误保留解锁目标和错误类型', () => {
  assert.throws(() => readResponse(200, { code: 2001, message: '请验证二级密码', data: { menuPath: '/finance' } }),
    error => error.name === 'SecondaryLockRequiredError' && error.menuPath === '/finance');
});

test('纯文本 401 仍识别为登录过期，5xx 不泄漏服务端内容', () => {
  assert.throws(() => readResponse(401, '未授权'), (error) => error.name === 'SessionExpiredError');
  assert.throws(() => readResponse(500, { message: 'private stack' }), /服务暂时不可用/);
});

test('保留字符串长 ID，拒绝已发生精度风险的数字 ID', () => {
  const id = '9223372036854775807';
  const user = readUser(readResponse(200, { code: 0, data: { id, nickname: '测试用户' } }));
  assert.equal(user.id, id);
  assert.equal(user.name, '测试用户');
  assert.throws(() => readUser({ id: 123 }), /用户信息异常/);
});

test('账号去空白检查，密码原样保留', () => {
  assert.equal(validateCredentials('  ', 'secret'), '请输入账号');
  assert.equal(validateCredentials('test', ''), '请输入密码');
  assert.equal(validateCredentials(' test ', ' pass '), '');
});


test('实际登录账号优先于旧接口的昵称展示字段', () => {
  const user = readUser({ id: '123', username: '生活记录者', accountUsername: 'u_123' });
  assert.equal(user.username, 'u_123');
});


test('头像只读取文件 ID 和展示 URL，不再使用旧 avatar 地址', () => {
  const fileId = '0123456789abcdef0123456789abcdef';
  const user = readUser({ id: '42', avatarFileId: fileId, avatarUrl: 'https://example.test/api/file/preview/' + fileId, avatar: 'http://localhost/old.png' });
  assert.equal(user.avatarFileId, fileId);
  assert.equal(user.avatarUrl, 'https://example.test/api/file/preview/' + fileId);
  assert.equal(user.avatar, undefined);
  assert.equal(readUser({ id: '42', avatar: 'http://localhost/old.png' }).avatarUrl, '');
  assert.equal(readUser({ id: '42', avatarFileId: null }).avatarFileId, null);
  assert.throws(() => readUser({ id: '42', avatarFileId: 123 }), /头像信息异常/);
});
