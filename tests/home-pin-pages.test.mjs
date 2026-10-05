import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

async function pageHarness(kind) {
  const path = kind === 'goal' ? 'tasks/goals' : 'records/anniversary';
  const source = await readFile(new URL(`../src/pages/${path}.uvue`, import.meta.url), 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const js = (await transform(script, { loader: 'ts', format: 'esm' })).code.replace(/^import[\s\S]*?;\n/gm, '');
  const records = [{ id: '9223372036854775807', title: '模拟记录', isPinned: 0 }];
  const hooks = {}, writes = [], toasts = [];
  let failPin = false;
  const pin = async (id, isPinned) => {
    writes.push({ id, isPinned });
    if (failPin) throw new Error('模拟固定失败');
    return { ...records[0], isPinned };
  };
  const fixture = {
    ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
    onMounted: fn => { hooks.mount = fn; }, onLoad: fn => { hooks.load = fn; }, onShow: () => {}, onUnmounted: () => {},
    usePageRefresh: load => load,
    createRecordScope: () => ({ wait: promise => promise }),
    fetchGoals: async () => records, fetchEvents: async () => records,
    setGoalPinned: pin, setAnniversaryPinned: pin,
    goalTypes: ['日'], statusLabels: [], statuses: [],
    textTags: value => value || '', daysFromToday: () => 0,
    uni: { showToast: value => toasts.push(value) },
  };
  const api = new Function(...Object.keys(fixture), `${js}\nreturn { load, open, togglePinned, ${kind === 'goal' ? 'editor' : 'form'}, pinningId, rows: ${kind === 'goal' ? 'goals' : 'rows'} };`)(...Object.values(fixture));
  if (kind === 'goal') {
    api.form = { value: null };
    api.editor.value = { open: (item = null, pinned = false) => { api.form.value = item ? { ...item } : { isPinned: pinned ? 1 : 0 }; } };
  }
  return { ...api, hooks, records, writes, toasts, failPin: (value = true) => { failPin = value; } };
}

for (const kind of ['goal', 'anniversary']) {
  test(`${kind} 首页新增默认固定，编辑深链只打开一次并保留字符串 ID`, async () => {
    const page = await pageHarness(kind);
    page.hooks.load({ create: '1', home: '1' });
    page.hooks.mount?.();
    assert.equal(page.form.value.isPinned, 1);
    page.open();
    assert.equal(page.form.value.isPinned, 0);
    page.hooks.load({ editId: page.records[0].id });
    await page.load();
    assert.equal(page.form.value.id, '9223372036854775807');
    page.form.value = null;
    await page.load();
    assert.equal(page.form.value, null);
  });

  test(`${kind} 固定成功更新原行，失败保留原状态且可重试`, async () => {
    const page = await pageHarness(kind);
    await page.load();
    await page.togglePinned(page.rows.value[0]);
    assert.deepEqual(page.writes[0], { id: '9223372036854775807', isPinned: 1 });
    assert.equal(page.rows.value[0].isPinned, 1);
    page.failPin();
    await page.togglePinned(page.rows.value[0]);
    assert.equal(page.rows.value[0].isPinned, 1);
    assert.equal(page.pinningId.value, '');
    assert.equal(page.toasts[0].title, '模拟固定失败');
    page.failPin(false);
    await page.togglePinned(page.rows.value[0]);
    assert.equal(page.rows.value[0].isPinned, 0);
  });

  test(`${kind} 已删除记录深链不给出空白编辑表单`, async () => {
    const page = await pageHarness(kind);
    page.hooks.load({ editId: 'missing-record' });
    await page.load();
    assert.equal(page.form.value, null);
    assert.match(page.toasts[0].title, /已删除或不可访问/);
  });
}
