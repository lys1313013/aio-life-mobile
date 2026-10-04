import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformSync } from 'esbuild';
import { computed, effectScope, reactive, ref, watch } from 'vue';

const file = await readFile(new URL('../src/pages/scan-login/index.uvue', import.meta.url), 'utf8');
const source = file.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*$/gm, '').replace(/\/\/ #ifdef WEB[\s\S]*?\/\/ #endif/g, '');
const script = transformSync(source, { loader: 'ts' }).code;
const fixture = { status: 'SCANNED', browser: 'Chrome', requestedAt: '2026-10-04T00:00:00Z', verificationCode: '1234', expiresIn: 120 };
function page(overrides = {}) {
  const session = reactive({ token: 'fixture-app-token', user: { name: '测试账号', username: 'fixture' } });
  const calls = []; let unload; const scope = effectScope();
  const names = ['computed', 'ref', 'watch', 'onShow', 'onUnload', 'fetchUser', 'restoreSession', 'session', 'themeClass', 'parseLoginQr', 'scanLoginQr', 'decideLoginQr', 'scanWithCamera', 'uni', 'setInterval', 'clearInterval'];
  const values = [computed, ref, watch, fn => fn(), fn => { unload = fn; }, async () => {}, () => {}, session, () => '',
    () => ({ id: 'fixture-id', ticket: 'fixture-ticket' }), overrides.inspect || (async () => fixture),
    overrides.decide || (async (...args) => { calls.push(args); }), overrides.camera || (async () => 'fixture-code'), {}, () => 1, () => {}];
  const vm = scope.run(() => new Function(...names, script + '\nreturn { scan, retry, decide, info, busy, error, result, remaining };')(...values));
  return { vm, session, calls, dispose() { unload(); scope.stop(); } };
}
test('扫码只打开确认页，用户点击后才授权且请求中不能重复提交', async () => {
  let finish; let decisions = 0;
  const p = page({ decide: async () => { decisions++; await new Promise(resolve => { finish = resolve; }); } });
  try {
    await p.vm.scan(); assert.equal(p.vm.info.value.verificationCode, '1234'); assert.equal(decisions, 0);
    const pending = p.vm.decide(true); await p.vm.decide(true); assert.equal(decisions, 1);
    finish(); await pending; assert.match(p.vm.result.value, /已确认/);
  } finally { p.dispose(); }
});
test('取消发送拒绝授权，过期后不能点击确认', async () => {
  const p = page();
  try { await p.vm.scan(); await p.vm.decide(false); assert.equal(p.calls[0][1], false); assert.match(p.vm.result.value, /已取消/); }
  finally { p.dispose(); }
  const expired = page({ inspect: async () => ({ ...fixture, expiresIn: 0 }) });
  try { await expired.vm.scan(); await expired.vm.decide(true); assert.equal(expired.calls.length, 0); }
  finally { expired.dispose(); }
});
test('确认响应丢失后保留票据并可重试，账号变化清除确认页', async () => {
  let count = 0;
  const p = page({ decide: async () => { if (++count === 1) throw new Error('网络异常'); } });
  try {
    await p.vm.scan(); await p.vm.decide(true); assert.equal(p.vm.error.value, '网络异常');
    await p.vm.decide(true); assert.equal(count, 2); assert.match(p.vm.result.value, /已确认/);
    p.session.token = 'other-account'; assert.equal(p.vm.info.value, null); assert.equal(p.vm.result.value, '');
  } finally { p.dispose(); }
});
test('离页后和切换账号后的旧扫码响应不能恢复确认页', async () => {
  let resolve;
  const p = page({ inspect: () => new Promise(done => { resolve = done; }) });
  const pending = p.vm.scan(); await Promise.resolve(); p.session.token = 'other-token';
  resolve(fixture); await pending; assert.equal(p.vm.info.value, null); p.dispose();
  let camera;
  const left = page({ camera: () => new Promise(done => { camera = done; }) });
  const scanning = left.vm.scan(); left.dispose(); camera('fixture-code'); await scanning;
  assert.equal(left.vm.info.value, null);
});
