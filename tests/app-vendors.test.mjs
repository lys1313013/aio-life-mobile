import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { appVendors } from '../scripts/app-vendors.mjs';

test('App 转换后的 ZIP 依赖仍可读取压缩账单', async () => {
  const plugin = appVendors();
  plugin.configResolved({ root: fileURLToPath(new URL('../', import.meta.url)) });
  const id = plugin.resolveId('jszip');
  const { code } = await plugin.load(id);
  const { default: JSZip } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const archive = new JSZip();
  archive.file('账单.csv', '金额,备注\n12.5,模拟数据');
  const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const decoded = await JSZip.loadAsync(bytes);
  assert.equal(await decoded.file('账单.csv').async('string'), '金额,备注\n12.5,模拟数据');
});

test('App IIFE 将动态导入内联，其他目标保留原分包配置', () => {
  const plugin = appVendors();
  const manualChunks = () => 'vendor';
  assert.deepEqual(plugin.outputOptions({ format: 'iife', manualChunks }), {
    format: 'iife', manualChunks: undefined, inlineDynamicImports: true,
  });
  assert.equal(plugin.outputOptions({ format: 'cjs', manualChunks }), undefined);
});
