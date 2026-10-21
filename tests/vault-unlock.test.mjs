import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
import { computed, effectScope, reactive, ref, watch } from 'vue';

// 执行真实页面脚本，只替换网络、加密耗时和平台 I/O。
const source = (await readFile(new URL('../src/pages/vault/index.uvue', import.meta.url), 'utf8'))
  .split('<script setup lang="ts">')[1].split('</script>')[0]
  .replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, '');
const createPage = new Function('ref', 'computed', 'watch', 'onShow', 'onHide', 'onUnload',
  'useAppLayout', 'session', 'restoreSession', 'request', 'decryptSecret', 'missingRequired', 'uni',
  transformSync(source, { loader: 'ts' }).code
    + '\nreturn { rows, master, password, unlocking, saving, formError, copyingId, askUnlock, unlock, copyPassword, load, lock };');

function fixture(t, count = 100) {
  const scope = effectScope();
  t.after(() => scope.stop());
  const hooks = {}, calls = [], clipboard = [], toasts = [];
  const session = reactive({ token: 'vault-fixture-token' });
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(9007199254740993n + BigInt(i)), title: '模拟密码' + i,
    password: 'cipher-' + i, salt: '02'.repeat(32),
  }));
  const control = { pending: null, failCopy: false };
  const page = scope.run(() => createPage(ref, computed, watch,
    fn => { hooks.show = fn; }, fn => { hooks.hide = fn; }, fn => { hooks.unload = fn; },
    () => ({}), session, () => {},
    async path => path === '/password/list' ? rows : [],
    async (cipher, key, salt) => {
      calls.push({ cipher, key, salt });
      if (control.pending) await control.pending;
      if (key !== 'fixture-master') throw new Error('模拟解密失败');
      return cipher.replace('cipher-', 'secret-');
    },
    (_kind, value) => !value.password,
    {
      setClipboardData(options) {
        if (control.failCopy) options.fail();
        else { clipboard.push(options.data); options.success(); }
      },
      showToast: options => toasts.push(options.title),
    }));
  return { page, hooks, calls, clipboard, toasts, session, control, rows };
}

test('百条密码解锁只验证一次，刷新不解密全库，明文不写入列表', async t => {
  const f = fixture(t), p = f.page;
  await p.load(); p.askUnlock(); p.password.value = 'fixture-master';
  await p.unlock();
  assert.equal(p.master.value, 'fixture-master');
  assert.equal(p.unlocking.value, false);
  assert.deepEqual(f.calls, [{ cipher: 'cipher-0', key: 'fixture-master', salt: '02'.repeat(32) }]);
  await p.load();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(p.rows.value, f.rows);
  await p.copyPassword(f.rows[99].id);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].cipher, 'cipher-99');
  assert.deepEqual(f.clipboard, ['secret-99']);
  assert.deepEqual(p.rows.value, f.rows);
});

test('复制触发解锁后只解密目标密码；错误主密码保留弹窗且不复制', async t => {
  const f = fixture(t), p = f.page;
  await p.load(); await p.copyPassword(f.rows[1].id);
  p.password.value = 'wrong-fixture'; await p.unlock();
  assert.equal(p.unlocking.value, true);
  assert.equal(p.master.value, '');
  assert.match(p.formError.value, /主密码不正确/);
  assert.deepEqual(f.clipboard, []);
  f.calls.length = 0;
  p.password.value = 'fixture-master'; await p.unlock();
  assert.deepEqual(f.calls.map(call => call.cipher), ['cipher-0', 'cipher-1']);
  assert.deepEqual(f.clipboard, ['secret-1']);
  assert.equal(p.copyingId.value, '');
});

for (const reason of ['lock', 'hide', 'logout']) {
  test(`密码解密期间 ${reason} 阻止迟到的剪贴板写入`, async t => {
    const f = fixture(t), p = f.page;
    await p.load(); p.master.value = 'fixture-master';
    let release;
    f.control.pending = new Promise(resolve => { release = resolve; });
    const pending = p.copyPassword(f.rows[1].id);
    assert.equal(p.copyingId.value, f.rows[1].id);
    await p.copyPassword(f.rows[1].id);
    assert.equal(f.calls.length, 1);
    if (reason === 'lock') p.lock();
    if (reason === 'hide') f.hooks.hide();
    if (reason === 'logout') f.session.token = '';
    release(); await pending;
    assert.deepEqual(f.clipboard, []);
    assert.equal(p.copyingId.value, '');
  });
}

test('剪贴板失败后保留解锁状态并允许重试', async t => {
  const f = fixture(t), p = f.page;
  await p.load(); p.master.value = 'fixture-master'; f.control.failCopy = true;
  await p.copyPassword(f.rows[1].id);
  assert.deepEqual(f.toasts, ['复制失败，请重试']);
  assert.equal(p.copyingId.value, '');
  f.control.failCopy = false;
  await p.copyPassword(f.rows[1].id);
  assert.deepEqual(f.clipboard, ['secret-1']);
});
