import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformSync } from 'esbuild';

let source = await readFile(new URL('../src/pages/scan-login/services/qr-login.ts', import.meta.url), 'utf8');
source = source.replace(/^import .*$/gm, '').replace(/\/\/ #ifdef WEB[\s\S]*?\/\/ #endif/g, '');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
function service(request = async () => {}, uni = {}) {
  const module = { exports: {} };
  new Function('module', 'exports', 'request', 'uni', compiled)(module, module.exports, request, uni);
  return module.exports;
}
const id = 'a'.repeat(64), ticket = 'b'.repeat(64);
const content = `aiolife://web-login?v=1&id=${id}&ticket=${ticket}`;
const info = { status: 'SCANNED', browser: 'Chrome · Windows', requestedAt: '2026-10-04T00:00:00Z', verificationCode: '0123', expiresIn: 120 };
test('只接受固定协议，不解析外域、重复参数、旧版本或缺失票据', () => {
  const { parseLoginQr } = service();
  assert.deepEqual(parseLoginQr(content), { id, ticket });
  for (const value of [content + '&redirect=https://example.com', content.replace('v=1', 'v=2'), content.replace('aiolife:', 'https:'), 'https://example.com', content.replace(ticket, 'token'), content + '\n']) {
    assert.throws(() => parseLoginQr(value), /二维码/);
  }
});
test('扫码只传票据，确认才发送授权，不传用户ID或复制App Token', async () => {
  const calls = [];
  const api = service(async (...args) => { calls.push(args); return info; });
  await api.scanLoginQr({ id, ticket, userId: 'untrusted' });
  assert.deepEqual(calls, [['/auth/qr-login/scan', 'POST', { id, ticket }]]);
  await api.decideLoginQr({ id, ticket }, false);
  assert.deepEqual(calls[1], ['/auth/qr-login/decision', 'POST', { id, ticket, approve: false }]);
});
test('拒绝未知状态、字符串期限与非法核对码', () => {
  const { readLoginQrInfo } = service();
  assert.deepEqual(readLoginQrInfo(info), info);
  for (const override of [{ status: 'WAITING' }, { expiresIn: '120' }, { expiresIn: 121 }, { verificationCode: '123' }]) {
    assert.throws(() => readLoginQrInfo({ ...info, ...override }), /异常/);
  }
});
test('原生扫码只开相机，取消与权限失败明确区分', async () => {
  const api = service(undefined, { scanCode(options) {
    assert.equal(options.onlyFromCamera, true); assert.deepEqual(options.scanType, ['qrCode']); options.success({ result: content });
  } });
  assert.equal(await api.scanWithCamera(), content);
  for (const [errMsg, name] of [['scanCode:fail cancel', 'ScanCancelledError'], ['scanCode:fail permission denied', 'ScanCameraError']]) {
    const failed = service(undefined, { scanCode(options) { options.fail({ errMsg }); } });
    await assert.rejects(failed.scanWithCamera(), { name });
  }
});
