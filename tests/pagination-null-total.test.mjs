import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';

const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64');
const pagination = await import(moduleURL(await readFile(new URL('../src/services/pagination.ts', import.meta.url), 'utf8')));
const { readPageTotal, mergePageItems, hasMorePageItems } = pagination;
const ref = value => ({ value });

test('未知分页总数保留 null，兼容十进制字符串，拒绝无效计数', () => {
  for (const value of [null, undefined]) assert.equal(readPageTotal(value), null);
  for (const value of [0, 42, '0', '42']) assert.equal(readPageTotal(value), Number(value));
  for (const value of ['', ' ', true, -1, 1.5, NaN, Infinity, '1e2', '9007199254740992']) assert.throws(() => readPageTotal(value));
  assert.equal(hasMorePageItems(30, null), true);
  assert.equal(hasMorePageItems(30, 30), false);
  assert.equal(hasMorePageItems(30, null, true), false);
});

test('分页按字符串 ID 去重，保序、更新字段并保留关联数据', () => {
  const previous = [{ id: '9223372036854775807', title: '旧', events: [{ id: '9' }] }];
  const result = mergePageItems(previous, [{ id: previous[0].id, title: '新' }, { id: '2' }, { id: '2', title: '末条' }]);
  assert.deepEqual(result, [{ ...previous[0], title: '新' }, { id: '2', title: '末条' }]);
  assert.equal(previous[0].title, '旧');
  assert.throws(() => mergePageItems([], [{ id: 9007199254740992 }]), /ID/);
});

// 执行页面自身的 load 函数，避免用复制的分页实现代替回归。
const targets = [
  ['notes', 'pages/records/notes.uvue'],
  ['library', 'pages/records/library.uvue'],
  ['feedback', 'pages/records/feedback.uvue'],
  ['messages', 'pages/messages/index.uvue'],
  ['ledger', 'pages/finance/ledger.uvue'],
  ['related', 'components/TimeRelatedSelector.uvue'],
];
async function fixture(kind, file, fetch) {
  const source = await readFile(new URL('../src/' + file, import.meta.url), 'utf8');
  const loadSource = source.match(/async function load\([^]*?\n}\n/)[0];
  const rows = ref([]), page = ref(1), total = ref(null), ended = ref(false), error = ref(''), moreError = ref('');
  const context = {
    ...pagination, rows, items: rows, adminRows: rows, page, adminPage: page, total, adminTotal: total,
    pageEnded: ended, adminEnded: ended, error, moreError, loading: ref(false), refreshing: ref(false),
    entryLoading: ref(false), failedMore: ref(false), keyword: ref(''), all: ref(false),
    kind: ref('movie'), props: { type: 1, kind: 'income' }, mode: ref('管理'), adminUser: ref(''),
    scope: { wait: value => value }, typeLabels: ref([]), statusLabels: kind === 'feedback' ? [] : ref([]), statuses: [],
    typeFilter: ref(''), statusFilter: ref(''), status: ref(''),
    mutationBusy: ref(false), filters: ref({}), expense: ref(false), selected: ref([]), openedRow: ref(''),
    ledgerId: row => row.id,
    fetchNotes: (_kind, next) => fetch(next), fetchFeedbacks: next => fetch(next),
    fetchLibrary: (_kind, params) => fetch(params.page), fetchAdminMessages: params => fetch(params.page),
    fetchLedger: (_kind, params) => fetch(params.page), getRelated: (_type, _keyword, next) => fetch(next),
  };
  const js = transformSync(`let alive=true, active=true, generation=0, version=0, stamp=0, listSerial=0, requestedEdit='', requestedCreate=false, needsReset=false;\n${loadSource}\nreturn load;`, { loader: 'ts' }).code;
  const load = new Function(...Object.keys(context), js)(...Object.values(context));
  const more = () => kind === 'ledger' ? load(false) : ['messages', 'related'].includes(kind) ? load(true) : load(false, true);
  return { rows, page, total, ended, error, moreError, load, more };
}

for (const [kind, file] of targets) {
  test(`${kind} 未知总数继续分页，失败原页重试、重复项去重、空末页停止`, async () => {
    const calls = []; let fail = true;
    const state = await fixture(kind, file, async page => {
      calls.push(page);
      if (page === 2 && fail) throw Error('模拟分页失败');
      return { items: page === 1 ? [{ id: '1' }, { id: '2' }] : page === 2 ? [{ id: '2' }, { id: '3' }] : [], total: null };
    });
    await state.load();
    assert.equal(state.total.value, null);
    await state.more();
    assert.equal(state.page.value, 1);
    assert.deepEqual(state.rows.value.map(row => row.id), ['1', '2']);
    assert.match(state.moreError.value || state.error.value, /模拟分页失败/);
    fail = false; await state.more();
    assert.deepEqual(state.rows.value.map(row => row.id), ['1', '2', '3']);
    assert.equal(state.page.value, 2);
    await state.more(); await state.more();
    assert.equal(state.ended.value, true);
    assert.deepEqual(calls, [1, 2, 2, 3]);
  });

  test(`${kind} 数字及旧字符串总数在末页停止，无效响应不覆盖旧分页状态`, async () => {
    let result = { items: [{ id: '1' }], total: '2' }, calls = 0;
    const state = await fixture(kind, file, async () => { calls++; return result; });
    await state.load();
    result = { items: [{ id: '2' }], total: -1 };
    await state.more();
    assert.equal(state.page.value, 1);
    assert.deepEqual(state.rows.value, [{ id: '1' }]);
    result = { items: [{ id: '2' }], total: 2 };
    await state.more(); await state.more();
    assert.equal(state.total.value, 2);
    assert.equal(state.page.value, 2);
    assert.equal(calls, 3);
  });
}
