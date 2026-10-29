import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformSync } from 'esbuild';
import { ref } from 'vue';

const file = await readFile(new URL('../src/pages/profile/index.uvue', import.meta.url), 'utf8');
const source = file.slice(file.indexOf('const scanning ='), file.indexOf('const user ='));
const script = transformSync(source, { loader: 'ts' }).code;
function entry(camera) {
  const calls = [];
  const session = { token: 'fixture-token' };
  const vm = new Function('ref', 'session', 'scanWithCamera', 'rememberScanResult', 'clearScanResult', 'uni', script + '\nreturn { startScan, scanning };')(
    ref, session, camera,
    (...args) => calls.push(['remember', ...args]), () => calls.push(['clear']),
    { navigateTo: async args => calls.push(['navigate', args.url]), showToast: args => calls.push(['toast', args.title]) },
  );
  return { ...vm, calls, session };
}
test('点击先打开相机，扫码完成前不跳页，重复点击不重复扫码', async () => {
  let finish; let cameras = 0;
  const p = entry(() => { cameras++; return new Promise(resolve => { finish = resolve; }); });
  const pending = p.startScan();
  await p.startScan();
  assert.equal(cameras, 1);
  assert.deepEqual(p.calls, []);
  finish('fixture-code'); await pending;
  assert.deepEqual(p.calls, [['remember', 'fixture-code', 'fixture-token'], ['navigate', '/pages/scan-login/index']]);
  assert.equal(p.scanning.value, false);
});
test('取消扫码不跳页、不提示错误；权限失败可重新点击', async () => {
  const p = entry(async () => { throw Object.assign(new Error('已取消扫码'), { name: 'ScanCancelledError' }); });
  await p.startScan();
  assert.deepEqual(p.calls, [['clear']]);
  assert.equal(p.scanning.value, false);
  const failed = entry(async () => { throw new Error('请检查相机权限'); });
  await failed.startScan();
  assert.deepEqual(failed.calls, [['clear'], ['toast', '请检查相机权限']]);
  assert.equal(failed.scanning.value, false);
});
test('扫码期间切换账号不交接结果', async () => {
  let finish;
  const p = entry(() => new Promise(resolve => { finish = resolve; }));
  const pending = p.startScan(); p.session.token = 'other-token';
  finish('fixture-code'); await pending;
  assert.deepEqual(p.calls, []);
});
