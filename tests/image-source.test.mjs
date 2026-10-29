import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
import { ref, reactive, watch, nextTick, effectScope } from 'vue';
const source = (await readFile(new URL('../src/services/use-image-source.ts', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '').replace('export function', 'function');
const script = transformSync(source, { loader: 'ts' }).code;
function harness(input = { fileId: 'first' }) {
  const pending = [], revoked = [], cleanup = [], session = reactive({ token: 'image-owner' }), props = reactive(input);
  const authFileUrl = id => new Promise((resolve, reject) => pending.push({ id, resolve, reject }));
  const create = new Function('ref', 'watch', 'onUnmounted', 'authFileUrl', 'session', 'URL', script + '\nreturn useImageSource;')(ref, watch, fn => cleanup.push(fn), authFileUrl, session, { revokeObjectURL: url => revoked.push(url) });
  const scope = effectScope();
  return { ...scope.run(() => create(() => props)), pending, revoked, props, session, close: () => { cleanup.forEach(fn => fn()); scope.stop(); } };
}
const tick = async () => { await nextTick(); await new Promise(setImmediate); };
test('封面切换时晚到旧下载不能覆盖当前图，且旧 Blob 全部释放', async () => {
  const h = harness();
  h.props.fileId = 'second'; await tick();
  h.pending[1].resolve('blob:second'); await tick();
  h.pending[0].resolve('blob:first'); await tick();
  assert.equal(h.source.value, 'blob:second'); assert.deepEqual(h.revoked, ['blob:first']);
  assert.equal(h.loading.value, true); h.imageLoad(); assert.equal(h.loading.value, false);
  h.close(); assert.deepEqual(h.revoked, ['blob:first', 'blob:second']);
});
test('封面失败可重试，离页后完成的下载立即释放', async () => {
  const h = harness(); h.pending[0].reject(new Error('mock')); await tick();
  assert.equal(h.failed.value, true); assert.equal(h.loading.value, false);
  const retry = h.load(); assert.equal(h.failed.value, false); assert.equal(h.loading.value, true);
  h.close(); h.pending[1].resolve('blob:late'); await retry;
  assert.equal(h.source.value, ''); assert.deepEqual(h.revoked, ['blob:late']);
});
test('退出账号立即清空私有封面，不带空令牌再次下载', async () => {
  const h = harness(); h.pending[0].resolve('blob:private'); await tick();
  h.session.token = ''; await tick();
  assert.equal(h.source.value, ''); assert.equal(h.loading.value, false);
  assert.equal(h.pending.length, 1); assert.deepEqual(h.revoked, ['blob:private']); h.close();
});
