import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const source = await readFile(new URL('../src/pages/admin/services/storage-state.ts', import.meta.url), 'utf8');
const { createStorageBrowser, storageBrowserState, readStoragePage, storageBreadcrumbs, storageObjectName } = await import(moduleUrl(source));
const item = key => ({ key, directory: false, size: '9223372036854775807', lastModified: null, previewable: false });
const page = (items, nextCursor = null, prefix = '') => ({ bucket: 'demo', items: items.map(item), nextCursor, prefix });
const gate = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b }); return {promise,resolve,reject}; };

test('目录、对象名和长整数字节值保持原始字符串，不规范化对象路径', () => {
  assert.equal(readStoragePage(page(['2026/a b&c#.pdf'])).items[0].size, '9223372036854775807');
  assert.deepEqual(storageBreadcrumbs('2026/a b/fi'), [{label:'2026',prefix:'2026/'},{label:'a b',prefix:'2026/a b/'}]);
  assert.equal(storageObjectName('2026/a b/file.pdf','2026/a b/fi'),'file.pdf');
  for (const value of [null, {}, {...page(['a']), nextCursor: 2}, {...page(['a']), items:[{...item('a'),size:-1}]}]) assert.throws(()=>readStoragePage(value));
});

test('游标触底去重，失败保留内容及失败页，重试同游标，空末页停止', async () => {
  const state = storageBrowserState(), calls = [], pending = gate(); let fail = true;
  const browser = createStorageBrowser(async params => {
    calls.push(params);
    if (!params.cursor) return page(['a','b'],'opaque&cursor');
    if (fail) throw Error('分页失败');
    return pending.promise;
  },state);
  await browser.load(); await browser.more();
  assert.deepEqual(state.items.map(row=>row.key),['a','b']);assert.equal(state.nextCursor,'opaque&cursor');assert.equal(state.moreError,'分页失败');
  await browser.more(); assert.equal(calls.length,2);
  fail = false; const retry = browser.retryMore();await browser.more();assert.equal(calls.length,3);
  pending.resolve(page([], 'backend-bug-cursor'));await retry; await browser.more();
  assert.equal(state.nextCursor,null);assert.equal(calls.length,3);assert.deepEqual(calls.map(call=>call.cursor),[undefined,'opaque&cursor','opaque&cursor']);
});

test('切目录及刷新作废旧分页，离页响应不回写；新页按 key 去重', async () => {
  const state=storageBrowserState(), old=gate(), hidden=gate();
  const browser=createStorageBrowser(params=> params.prefix==='hidden/'?hidden.promise:params.prefix==='new/'?Promise.resolve(page(['new/c'],null,'new/')):params.cursor?old.promise:Promise.resolve(page(['a'],'next')),state);
  await browser.load(); const more=browser.more();await browser.load('new/');old.resolve(page(['a','old']));await more;
  assert.deepEqual(state.items.map(row=>row.key),['new/c']);assert.equal(state.prefix,'new/');
  const late=browser.load('hidden/');browser.pause();hidden.resolve(page(['hidden/leak'],null,'hidden/'));await late;
  assert.equal(state.loading,false);assert.deepEqual(state.items.map(row=>row.key),['new/c']);
  browser.resume();await browser.load('');
  const next=createStorageBrowser(async()=>page(['a','b','b'],null),state);await next.load('',true);
  assert.deepEqual(state.items.map(row=>row.key),['a','b']);
});

test('失败路径保留旧路径和内容，重试目标不丢失；并发刷新不能复活已删除文件', async () => {
  const state=storageBrowserState(), pending=gate();let fail=true;
  const browser=createStorageBrowser(params=> {
    if(params.prefix==='bad/'&&fail)return Promise.reject(Error('失败'));
    if(params.prefix==='refresh/')return pending.promise;
    return Promise.resolve(page([params.prefix+'file'],null,params.prefix));
  },state);
  await browser.load();await browser.load('bad/');assert.equal(state.prefix,'');assert.equal(state.items[0].key,'file');
  fail=false;await browser.retry();assert.equal(state.prefix,'bad/');
  const late=browser.load('refresh/');browser.remove('refresh/file');pending.resolve(page(['refresh/file','refresh/ok'],null,'refresh/'));await late;
  assert.deepEqual(state.items.map(row=>row.key),['refresh/ok']);
});

test('列表和删除只发送真实契约字段，文件请求编码 key 并通过 Bearer 鉴权', async () => {
  const raw = await readFile(new URL('../src/pages/admin/services/storage.ts',import.meta.url),'utf8');
  const requests=[];
  globalThis.__storageMocks={session:{token:'test-token'},request:(...args)=>{requests.push(args);return Promise.resolve(null)},apiUrl:path=>'https://example.test/api'+path,clearSession:()=>{},queryPath:(path,params)=>path+'?'+Object.entries(params).filter(([,value])=>value!=null).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&')};
  const compiled=await transform(raw.replace(/^import .+\n/gm,'')+'\n', {loader:'ts',format:'esm'});
  const api=await import(moduleUrl('const {session,request,apiUrl,clearSession,queryPath}=globalThis.__storageMocks;\n'+compiled.code));
  const key='2026/a b&中#.png';
  await api.queryStorageObjects({prefix:'2026/',cursor:'opaque&cursor',pageSize:24});await api.deleteStorageObject(key);
  assert.equal(requests[0][0],'/system/storage/objects?prefix=2026%2F&cursor=opaque%26cursor&pageSize=24');
  assert.deepEqual(requests[1],['/system/storage/object?key='+encodeURIComponent(key),'DELETE']);
  assert.equal(api.storageFilePath(key),'/system/storage/preview?key='+encodeURIComponent(key));
  assert.throws(()=>api.storageFilePath('folder/'));
  let observed;
  globalThis.uni={request:options=>{observed=options;options.success({statusCode:200,header:{'content-type':'application/json'},data:new ArrayBuffer(0)})}};
  await assert.rejects(api.readStorageObject(key),/文件读取失败/);
  assert.equal(observed.header.Authorization,'Bearer test-token');assert.equal(observed.url.includes('test-token'),false);
  globalThis.uni={request:options=>{globalThis.__storageMocks.session.token='new-token';options.success({statusCode:200,header:{'content-type':'image/png'},data:new ArrayBuffer(0)})}};
  await assert.rejects(api.readStorageObject(key),/登录状态已变化/);
  delete globalThis.uni;delete globalThis.__storageMocks;
});


test('存储界面图标均来自本地目录，原生操作按钮声明可访问角色', async () => {
  const icons = JSON.parse(await readFile(new URL('../src/services/icons/catalog.generated.json', import.meta.url), 'utf8')).icons;
  for (const path of ['../src/pages/admin/storage.uvue', '../src/pages/admin/components/StorageThumbnail.uvue']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(?:name|icon)="((?:lucide|ant-design):[^" ]+)"/g)) assert.ok(icons[match[1]], match[1]);
    for (const match of source.matchAll(/<button\b[^>]*>/g)) assert.match(match[0], /role="button"/);
  }
});
