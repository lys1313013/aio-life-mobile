import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';

// 执行当前组件的真实逻辑，网络与挂载事件使用明确模拟；不复制分页实现。
const source = (await readFile(new URL('../src/pages/finance/ledger.uvue', import.meta.url), 'utf8'))
  .split('<script setup lang="ts">')[1].split('</script>')[0]
  .replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, '');
let fixtureNumber = 0;
function gate() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(kind = 'expense', count = 101) {
  const id = ++fixtureNumber;
  const calls = [], hooks = {};
  const server = Array.from({ length: count }, (_, i) => ({ id: String(i + 1), amt: 1, expTime: '2026-10-03 12:00:00' }));
  const controls = { listFailure: false, statsFailure: false, mutationFailure: false, pendingList: null, pendingMutation: null, pendingStatistics: null };
  const api = {
    ledgerId: row => row.id || '',
    fetchDictionary: async () => ({ dictDetailList: [{ id: 'type', dictLabel: '模拟分类' }] }),
    fetchLedger: async (_kind, { page, pageSize }) => {
      calls.push(['list', page]);
      if (controls.listFailure) throw Error('模拟列表失败');
      const snapshot = { items: server.slice((page - 1) * pageSize, page * pageSize).map(x => ({ ...x })), total: server.length };
      const pending = controls.pendingList; controls.pendingList = null;
      if (pending) await pending.promise;
      return snapshot;
    },
    fetchFinanceStatistics: async (_kind, period) => {
      calls.push(['statistics', period]);
      if (controls.statsFailure) throw Error('模拟统计失败');
      const snapshot = [{ year: 2026, month: period === 'Month' ? 10 : undefined, detail: [{ amt: server.reduce((n, x) => n + x.amt, 0) }] }];
      const pending = controls.pendingStatistics; controls.pendingStatistics = null;
      if (pending) await pending.promise;
      return snapshot;
    },
    saveLedger: async (_kind, row) => {
      if (controls.mutationFailure) throw Error('模拟写入失败');
      if (controls.pendingMutation) await controls.pendingMutation.promise;
      const existing = server.find(x => x.id === row.id);
      if (existing) Object.assign(existing, row);
      else server.unshift({ ...row, id: 'new' });
    },
    deleteLedger: async (_kind, rowId) => {
      if (controls.mutationFailure) throw Error('模拟写入失败');
      if (controls.pendingMutation) await controls.pendingMutation.promise;
      server.splice(server.findIndex(x => x.id === rowId), 1);
    },
    deleteExpenses: async ids => {
      if (controls.mutationFailure) return false;
      for (const rowId of ids) server.splice(server.findIndex(x => x.id === rowId), 1);
    },
  };
  globalThis.__ledgerFixtures ||= {};
  globalThis.__ledgerFixtures[id] = { api, hooks };
  const vue = new URL('../node_modules/vue/index.mjs', import.meta.url).href;
  const prefix = `import { ref, computed, watch } from ${JSON.stringify(vue)};
const {api,hooks}=globalThis.__ledgerFixtures[${id}];
const {fetchLedger,fetchDictionary,saveLedger,deleteLedger,deleteExpenses,ledgerId,fetchFinanceStatistics}=api;
const useAppLayout=()=>({appGridItem:()=>({})});
const defineExpose=()=>{};
const onMounted=fn=>{hooks.mount=fn},onUnmounted=fn=>{hooks.unmount=fn},defineProps=()=>({kind:${JSON.stringify(kind)}});`;
  const exports = 'export {initialize,load,loadMore,loadStatistics,refresh,save,remove,removeSelected,rows,page,total,pageEnded,moreError,error,statistics,statisticsError,statisticsBusy,overviewRows,statisticsPeriod,loading,refreshing,draft,selected,modal,formError};';
  const code = transformSync(prefix + source + exports, { loader: 'ts', format: 'esm' }).code;
  const state = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  delete globalThis.__ledgerFixtures[id];
  return { state, server, controls, calls, hooks };
}
for (const kind of ['expense', 'income']) test(`${kind} 删除首屏记录后重新建立分页，不跳过第51条`, async () => {
  const { state: s, server } = await fixture(kind);
  await s.initialize();
  await s.remove(s.rows.value[0]);
  assert.equal(s.rows.value.length, 50); assert.equal(s.page.value, 1);
  await s.load(false);
  assert.deepEqual(s.rows.value.map(x => x.id), server.map(x => x.id));
  assert.equal(s.total.value, 100);
});
test('批量删除后分页完整；空页停止，重复触底不重入', async () => {
  const { state: s, server, controls, calls } = await fixture();
  await s.initialize(); s.selected.value = ['1', '3', '5']; await s.removeSelected();
  const pending = gate(); controls.pendingList = pending;
  const next = s.load(false); s.loadMore(); s.loadMore();
  assert.equal(calls.filter(x => x[0] === 'list' && x[1] === 2).length, 1);
  pending.resolve(); await next;
  assert.deepEqual(s.rows.value.map(x => x.id), server.map(x => x.id));
  const before = calls.length; await s.load(false); assert.equal(calls.length, before);
});
test('增改删及下拉刷新同时更新月度概览和年度统计', async () => {
  const { state: s, server } = await fixture('income', 1);
  await s.initialize(); s.statisticsPeriod.value = '年度';
  s.draft.value = { amt: 200 }; await s.save();
  assert.equal(s.overviewRows.value[0].detail[0].amt, 201);
  assert.equal(s.statistics.value[0].detail[0].amt, 201);
  s.draft.value = { id: 'new', amt: 300 }; await s.save();
  assert.equal(s.overviewRows.value[0].detail[0].amt, 301);
  await s.remove({ id: 'new' }); assert.equal(s.overviewRows.value[0].detail[0].amt, 1);
  server.push({ id: 'external', amt: 40 }); await s.refresh();
  assert.equal(s.overviewRows.value[0].detail[0].amt, 41);
  assert.equal(s.statistics.value[0].detail[0].amt, 41); assert.equal(s.refreshing.value, false);
});
test('删除后重查失败保留已有内容，重试从第一页恢复且统计错误独立', async () => {
  const { state: s, server, controls } = await fixture(); await s.initialize();
  const original = [...s.rows.value]; controls.listFailure = true;
  await s.remove(original[0]);
  assert.deepEqual(s.rows.value, original); assert.equal(s.error.value, '模拟列表失败');
  assert.equal(s.overviewRows.value[0].detail[0].amt, 100);
  controls.listFailure = false; controls.statsFailure = true;
  await s.refresh(); assert.equal(s.rows.value[0].id, '2'); assert.equal(s.error.value, '');
  assert.equal(s.statisticsError.value, '模拟统计失败'); assert.equal(s.overviewRows.value[0].detail[0].amt, 100);
  controls.statsFailure = false; await s.loadStatistics(); await s.load(false);
  assert.deepEqual(s.rows.value.map(x => x.id), server.map(x => x.id)); assert.equal(s.statisticsError.value, '');
});
test('分页失败保留页码/列表，仅重试失败页', async () => {
  const { state: s, controls, calls } = await fixture(); await s.initialize();
  controls.listFailure = true; await s.load(false);
  assert.equal(s.rows.value.length, 50); assert.equal(s.page.value, 1); assert.equal(s.moreError.value, '模拟列表失败');
  controls.listFailure = false; await s.load(false);
  assert.equal(s.rows.value.length, 100); assert.equal(s.page.value, 2);
  assert.deepEqual(calls.filter(x => x[0] === 'list').map(x => x[1]), [1,2,2]);
});
test('写入使旧分页及旧统计失效，写入中的刷新不能重建旧快照', async () => {
  const { state: s, controls } = await fixture(); await s.initialize();
  const oldPage = gate(), oldStats = gate(), write = gate();
  controls.pendingList = oldPage; const pageRequest = s.load(false);
  controls.pendingStatistics = oldStats; const statsRequest = s.loadStatistics();
  controls.pendingMutation = write; const deletion = s.remove({ id: '1' });
  await s.refresh(); oldPage.resolve(); oldStats.resolve(); await Promise.all([pageRequest, statsRequest]);
  assert.equal(s.rows.value.length, 50);
  write.resolve(); await deletion;
  assert.equal(s.rows.value[0].id, '2'); assert.equal(s.page.value, 1);
  assert.equal(s.overviewRows.value[0].detail[0].amt, 100);
});
test('旧分页晚于写入后重查返回也不能覆盖；离页响应忽略', async () => {
  const { state: s, controls, hooks } = await fixture(); await s.initialize();
  const pending = gate(); controls.pendingList = pending; const old = s.load(false);
  await s.remove({ id: '1' }); pending.resolve(); await old;
  assert.equal(s.rows.value.length, 50); assert.equal(s.rows.value[0].id, '2');
  const leaving = gate(); controls.pendingList = leaving; const final = s.load(false);
  hooks.unmount(); leaving.resolve(); await final; assert.equal(s.rows.value.length, 50);
});
test('写入失败保留列表和表单，批量删除 false 不伪装成功', async () => {
  const { state: s, controls, server } = await fixture(); await s.initialize(); controls.mutationFailure = true;
  s.modal.value = true; s.draft.value = { amt: 5 }; await s.save();
  assert.equal(s.modal.value, true); assert.equal(s.formError.value, '模拟写入失败');
  assert.equal(s.rows.value.length, 50); s.selected.value = ['1'];
  await assert.rejects(s.removeSelected(), /记录未更新/); assert.equal(server.length, 101); assert.deepEqual(s.selected.value, ['1']);
});
