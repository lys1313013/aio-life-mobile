import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { createReport, checkSettings, LIMIT_BYTES, WARNING_BYTES } = require('../scripts/weixin-size-report.cjs');
const config = { compileType: 'miniprogram', setting: { minified: true, minifyWXSS: true, minifyWXML: true, uploadWithSourceMap: false } };
function fixture(extra = {}, app = {}) {
  return { 'app.json': JSON.stringify({ pages: ['pages/home/index'], ...app }), 'pages/home/index.js': '', ...extra };
}
function mainOfSize(bytes) {
  const files = fixture();
  files['asset.bin'] = Buffer.alloc(bytes - Buffer.byteLength(files['app.json']));
  return files;
}

test('微信编译后的字节数保留多字节文本和二进制，不按字符数或 gzip/ZIP 大小计费', () => {
  const result = createReport(fixture({ '文档.txt': '生活🙂', 'asset.bin': Buffer.from([0, 255, 1]) }));
  const files = result.packages[0].files;
  assert.equal(files.find(file => file.path === '文档.txt').bytes, 10);
  assert.equal(files.find(file => file.path === 'asset.bin').bytes, 3);
});

test('精确处理 1900 KB 预警与 2048 KB 硬上限，超出一字节即失败', () => {
  assert.equal(createReport(mainOfSize(WARNING_BYTES)).status, 'ok');
  assert.equal(createReport(mainOfSize(WARNING_BYTES + 1)).status, 'warning');
  assert.equal(createReport(mainOfSize(LIMIT_BYTES)).status, 'warning');
  const over = createReport(mainOfSize(LIMIT_BYTES + 1));
  assert.equal(over.status, 'error');
  assert.equal(over.packages[0].remainingBytes, -1);
});

test('主包与分包独立计数，目录名称前缀相似的主包文件不会漏算', () => {
  const result = createReport(fixture({ 'pages/test/index.js': Buffer.alloc(LIMIT_BYTES), 'pages/testing/index.js': 'main', 'common/vendor.js': 'shared' }, {
    subPackages: [{ root: 'pages/test/', pages: ['index'] }],
  }));
  assert.equal(result.packages[1].bytes, LIMIT_BYTES);
  assert.equal(result.packages[1].status, 'warning');
  assert.ok(result.packages[0].files.some(file => file.path === 'pages/testing/index.js'));
  assert.ok(result.packages[0].files.some(file => file.path === 'common/vendor.js'));
  assert.ok(result.totalBytes > LIMIT_BYTES);
  assert.equal(result.status, 'warning');
});

test('独立分包超限同样阻断，兼容 subpackages 写法且文件不会重复计数', () => {
  const result = createReport(fixture({ '/pages/test/index.js': Buffer.alloc(LIMIT_BYTES + 1) }, {
    subpackages: [{ root: 'pages/test', pages: ['index'], independent: true }],
  }));
  assert.equal(result.status, 'error');
  assert.equal(result.packages[1].bytes, LIMIT_BYTES + 1);
  assert.equal(result.packages[0].files.length, 2);
});

test('编译结果或分包异常时失败，不回退为空包通过', () => {
  assert.throws(() => createReport({}), /缺少 app.json/);
  assert.throws(() => createReport({ 'app.json': '{' }));
  assert.throws(() => createReport(fixture({ 'asset': {} })), /无效的编译内容/);
  assert.throws(() => createReport(fixture({ '../asset': '' })), /无效的编译产物路径/);
  assert.throws(() => createReport(fixture({ '/app.json': '{}' })), /路径重复/);
  assert.throws(() => createReport(fixture({}, { subPackages: [{ root: 'pages/missing', pages: ['index'] }] })), /缺少编译产物/);
  assert.throws(() => createReport(fixture({}, { plugins: { example: {} } })), /不支持/);
});

test('发布压缩选项或开发工具私有编译配置漂移时阻断检查', () => {
  assert.doesNotThrow(() => checkSettings(config, { setting: { bigPackageSizeSupport: true } }));
  assert.throws(() => checkSettings({ ...config, setting: { ...config.setting, minified: false } }), /minified/);
  assert.throws(() => checkSettings(config, { setting: { minifyWXSS: false } }), /覆盖/);
  assert.throws(() => checkSettings(config, { setting: { uploadWithSourceMap: true } }), /覆盖/);
  assert.throws(() => checkSettings({ ...config, miniprogramRoot: 'other/' }), /根目录/);
});

test('报告按真实字节数排序，能直接定位最大的主包文件', () => {
  const report = createReport(fixture({ 'small.bin': Buffer.alloc(1024), 'large.bin': Buffer.alloc(4096) }));
  assert.equal(report.packages[0].files[0].path, 'large.bin');
  assert.equal(report.packages[0].files[1].path, 'small.bin');
});

test('CLI 缺失构建产物时退出失败并删除旧报告，不会伪报上次的通过结果', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-size-cli-test-'));
  try {
    const report = path.join(temp, 'report.json');
    fs.writeFileSync(report, '{"status":"ok"}');
    fs.writeFileSync(path.join(temp, 'report.txt'), '旧的通过报告');
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-weixin-size.cjs', import.meta.url)), '--project', path.join(temp, 'missing-build'), '--report', report], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /微信编译失败/);
    assert.equal(fs.existsSync(report), false);
    assert.equal(fs.existsSync(path.join(temp, 'report.txt')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
