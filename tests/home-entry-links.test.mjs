import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformSync } from 'esbuild';

const id = '9223372036854775807';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64');
let sequence = 0;

async function pageLoadFixture(page, functionEnd) {
  const pageSource = await readFile(new URL(`../src/pages/${page}.uvue`, import.meta.url), 'utf8');
  const start = pageSource.indexOf('async function load(');
  const source = pageSource.slice(start, pageSource.indexOf(functionEnd, start));
  const fixture = { selected: null, fail: false, missing: false, detailCalls: [] };
  const key = `__homeEntry${++sequence}`;
  globalThis[key] = fixture;
  const code = `
const fixture = globalThis[${JSON.stringify(key)}];
let requestedEdit = ${JSON.stringify(id)}, requestedCreate = false, alive = true, generation = 0;
const rows = {value:[]}, page={value:1}, total={value:0}, keyword={value:''}, loading={value:false}, refreshing={value:false}, error={value:''}, moreError={value:''}, pageEnded={value:false};
const kind={value:'memo'}, status={value:'全部状态'}, statusLabels={}, statuses=[], typeFilter={value:'全部类型'}, types={value:[]}, counts={value:{}}, statistics={value:{}};
const scope={wait: promise=>promise}, open=value=>fixture.selected=value, stopCoverPolling=()=>{}, pollCovers=()=>{}, loadPhoto=()=>{};
const full = {id:${JSON.stringify(id)}, title:'模拟记录', content:'完整私密正文', hiddenContent:true, notes:'完整备注', pagesInfo:'[]', purchasePlace:'模拟渠道'};
const fetchDictionary=async()=>({dictDetailList:[]}), fetchVideoCounts=async()=>({}), fetchVideoStatistics=async()=>({});
const fetchNotes=async()=>({items:[],total:0});
const fetchMemoById=async value=>{fixture.detailCalls.push(value); if(fixture.fail)throw Error('模拟读取失败'); return fixture.missing?null:full;};
const fetchNoteById=async()=>({items:[]});
const fetchVideoPage=async()=>{if(fixture.fail)throw Error('模拟读取失败'); return {items:fixture.missing?[]:[full],total:fixture.missing?0:1};};
const fetchDevicePage=fetchVideoPage;
${source}
export {load, loading, error};`;
  const state = await import(moduleUrl(code));
  delete globalThis[key];
  return { fixture, state };
}

for (const [page, end] of [['records/notes', 'function open('], ['records/video', 'function open('], ['goods/devices', 'async function loadPhoto(']]) {
  test(`${page} 首页条目读取完整记录后打开，失败保留入口可重试`, async () => {
    const { fixture, state } = await pageLoadFixture(page, end);
    fixture.fail = true;
    await state.load();
    assert.equal(fixture.selected, null);
    assert.match(state.error.value, /模拟读取失败/);
    assert.equal(state.loading.value, false);
    fixture.fail = false;
    await state.load();
    assert.equal(fixture.selected.id, id);
    assert.equal(fixture.selected.content, '完整私密正文');
    assert.equal(fixture.selected.hiddenContent, true);
    fixture.selected = null;
    await state.load();
    assert.equal(fixture.selected, null, '刷新不能重复打开已消费的入口');
    if (page === 'records/notes') assert.deepEqual(fixture.detailCalls, [id, id]);
  });
  test(`${page} 已删除条目显示失败，不打开空白新增表单`, async () => {
    const { fixture, state } = await pageLoadFixture(page, end);
    fixture.missing = true;
    await state.load();
    assert.equal(fixture.selected, null);
    assert.match(state.error.value, /记录不存在或已删除/);
  });
}
