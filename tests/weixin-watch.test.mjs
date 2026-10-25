import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { weixinSharedServices } from '../scripts/weixin-shared-services.mjs';
import { weixinSubpackageVendors } from '../scripts/weixin-subpackage-vendors.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-watch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src/services'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const file of ['src/pages.json', 'scripts/weixin-package-policy.json']) {
    fs.copyFileSync(file, path.join(root, file));
  }
  // 小型模拟引擎，避免回归测试打包真实图表库。
  fs.writeFileSync(path.join(root, 'src/services/chart-engine-runtime.ts'), 'export const fixture = true;');
  return root;
}
const context = () => ({
  meta: { watchMode: true },
  error(message) { throw new Error(message); },
  addWatchFile() {}, emitFile() {},
});
const chunk = (fileName, code = '') => ({
  type: 'chunk', fileName, code, moduleIds: [], modules: {}, imports: [], dynamicImports: [],
});

test('监听第二轮复用共享工具虚拟 ID，并读取最新源码', async t => {
  const root = fixture(t), plugin = weixinSharedServices(), ctx = context();
  const original = path.join(root, 'src/services/query-path.ts');
  fs.writeFileSync(original, 'export const value = 1;');
  plugin.configResolved({ root });
  await plugin.buildStart?.call(ctx);
  const id = await plugin.resolveId.call(ctx, '../../services/query-path.ts', path.join(root, 'src/pages/finance/index.ts'));
  assert.match(plugin.load.call(ctx, id).code, /value = 1/);
  fs.writeFileSync(original, 'export const value = 2;');
  await plugin.buildStart?.call(ctx);
  // Rollup 缓存解析结果，第二轮直接 load，不再次 resolveId。
  assert.match(plugin.load.call(ctx, id).code, /value = 2/);
});

test('监听增量不包含 app.json 时仍检查完整产物和依赖归属', async t => {
  const root = fixture(t), plugin = weixinSubpackageVendors(), ctx = context();
  plugin.configResolved({ root });
  await plugin.buildStart.call(ctx);
  const id = plugin.resolveId.call(ctx, 'xlsx', path.join(root, 'src/pages/finance/index.ts'));
  const manual = plugin.outputOptions.call(ctx, { manualChunks: () => 'common/vendor' }).manualChunks;
  plugin.generateBundle.handler.call(ctx, {}, {
    'app.json': { type: 'asset', fileName: 'app.json', source: JSON.stringify({ pages: [], subPackages: [{ root: 'pages/finance', pages: ['index'] }] }) },
    'app.js': chunk('app.js'),
  });
  await plugin.buildStart.call(ctx);
  assert.equal(manual(id, {}), 'pages/finance/common/vendor');
  assert.doesNotThrow(() => plugin.generateBundle.handler.call(ctx, {}, { 'app.js': chunk('app.js') }));
  // 缺少 app.json 不能导致跳过增量产物的跨分包保护。
  assert.throws(() => plugin.generateBundle.handler.call(ctx, {}, {
    'app.js': chunk('app.js', 'require("./pages/finance/index.js");'),
  }), /非法跨分包依赖/);
});
