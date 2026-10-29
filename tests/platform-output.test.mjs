import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
const require = createRequire(import.meta.url);
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess');
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js');

function fixture(platform) {
  const context = initScopedPreContext(platform === 'android' ? 'app' : platform, {}, platform === 'android' ? 'app-android' : undefined, true).preUVueContext;
  const source = ['src/pages/admin/services/file-output.ts', 'src/pages/admin/services/export.ts']
    .map(file => preprocess(fs.readFileSync(file, 'utf8'), context, { type: 'js' }).replace(/^import .*$/gm, '')).join('\n');
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  const calls = [], pending = [], state = { holdWrite: false, failSave: false }, session = { token: 'mock-session' };
  const uni = {
    env: { USER_DATA_PATH: '/wx', CACHE_PATH: '/app' },
    request: options => { calls.push(['request', options.url]); options.success({ statusCode: 200, header: { 'content-type': 'text/csv' }, data: new ArrayBuffer(3) }); },
    getFileSystemManager: () => ({
      writeFile: options => { calls.push(['write', options.filePath, options.data.byteLength]); if (state.holdWrite) pending.push(options); else options.success(); },
      unlink: options => calls.push(['release', options.filePath]),
    }),
    saveFile: options => { calls.push(['save', options.tempFilePath]); state.failSave ? options.fail() : options.success({ savedFilePath: '/saved/logs.csv' }); },
    shareFileMessage: options => { calls.push(['share', options.filePath, options.fileName]); state.failSave ? options.fail() : options.success(); },
  };
  const url = { createObjectURL: () => 'blob:mock', revokeObjectURL: value => calls.push(['release', value]) };
  const document = { createElement: () => ({ click: () => calls.push(['download']) }) };
  const module = { exports: {} };
  new Function('exports', 'module', 'uni', 'session', 'apiUrl', 'queryPath', 'URL', 'document', 'setTimeout', code)
    (module.exports, module, uni, session, value => '/api' + value, path => path, url, document, callback => callback());
  return { api: module.exports, calls, pending, session, state };
}

for (const platform of ['android', 'mp-weixin', 'h5']) test(`${platform} 日志导出只请求一次并释放临时文件`, async () => {
  const f = fixture(platform);
  assert.equal(await f.api.exportLogs('access', {}), 'aio-life-access-logs.csv');
  assert.equal(f.calls.filter(([kind]) => kind === 'request').length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === 'release').length, 1);
  assert.equal(f.calls.filter(([kind]) => ['save', 'share', 'download'].includes(kind)).length, 1);
  if (platform !== 'h5') assert.equal(f.calls.find(([kind]) => kind === 'write')[2], 3);
});

for (const platform of ['android', 'mp-weixin']) {
  test(`${platform} 分享或保存失败仍清理文件且可以重试`, async () => {
    const f = fixture(platform); f.state.failSave = true;
    await assert.rejects(f.api.exportLogs('operation', {}));
    assert.equal(f.calls.filter(([kind]) => kind === 'release').length, 1);
    f.state.failSave = false;
    await f.api.exportLogs('operation', {});
    assert.equal(f.calls.filter(([kind]) => kind === 'release').length, 2);
  });
  test(`${platform} 写入期间切账号不会保存或分享旧文件`, async () => {
    const f = fixture(platform); f.state.holdWrite = true;
    const result = f.api.exportLogs('access', {});
    f.session.token = 'different-mock-session';
    f.pending[0].success();
    await assert.rejects(result, /登录状态已变化/);
    assert.equal(f.calls.filter(([kind]) => ['save', 'share'].includes(kind)).length, 0);
    assert.equal(f.calls.filter(([kind]) => kind === 'release').length, 1);
  });
}
