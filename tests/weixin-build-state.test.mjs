import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  weixinStatePaths, weixinSourceSnapshot, weixinSourceFingerprint,
  readWeixinBuildState, writeWeixinBuildState,
} from '../scripts/weixin-build-state.mjs';
import { weixinOutput } from '../scripts/weixin-output.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-state-')));
  const cleanup = [];
  t.after(() => {
    for (const dispose of cleanup) dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (name, content) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  return { root, write, cleanup, destination: path.join(root, 'dist/dev/mp-weixin') };
}

test('源码指纹按内容覆盖源码、构建脚本、锁文件和环境配置，不依赖时间戳或工具私有缓存', t => {
  const f = fixture(t);
  const sources = ['src/page.uvue', 'src/project.config.json', 'scripts/build.mjs',
    'package.json', 'package-lock.json', 'vite.config.js', '.env', '.env.local'];
  for (const file of sources) f.write(file, 'fixture-original');
  const original = weixinSourceFingerprint(f.root);
  assert.match(original, /^[a-f0-9]{64}$/);
  for (const file of sources) {
    f.write(file, 'fixture-new');
    assert.notEqual(weixinSourceFingerprint(f.root), original, file);
    f.write(file, 'fixture-original');
    assert.equal(weixinSourceFingerprint(f.root), original, file);
  }
  for (const file of ['src/project.private.config.json', 'src/nested/project.private.config.json',
    'src/.DS_Store', 'artifacts/runtime.log', 'dist/app.js', 'node_modules/fixture.js']) f.write(file, 'ignored');
  fs.utimesSync(path.join(f.root, 'src/page.uvue'), new Date(0), new Date(0));
  assert.equal(weixinSourceFingerprint(f.root), original);
  f.write('src/new.ts', 'new source');
  assert.notEqual(weixinSourceFingerprint(f.root), original);
  fs.unlinkSync(path.join(f.root, 'src/new.ts'));
  assert.equal(weixinSourceFingerprint(f.root), original);
  const snapshot = weixinSourceSnapshot(f.root);
  assert.equal(snapshot.fingerprint, original);
  assert.ok(Object.values(snapshot.files).every(value => /^[a-f0-9]{64}$/.test(value)));
});

test('状态按输出目录隔离，原子保存失败状态时保留成功指纹，不保存配置内容', t => {
  const f = fixture(t);
  f.write('.env.local', 'MOCK_TOKEN=fixture-secret-must-not-be-persisted');
  f.write('src/project.config.json', '{"appid":"fixture-only"}');
  const release = path.join(f.root, 'dist/build/mp-weixin');
  assert.notEqual(weixinStatePaths(f.root, f.destination).stateFile, weixinStatePaths(f.root, release).stateFile);
  assert.equal(readWeixinBuildState(f.root, f.destination), null);
  const fingerprint = weixinSourceFingerprint(f.root);
  writeWeixinBuildState(f.root, f.destination, { status: 'ready', mode: 'dev', sourceFingerprint: fingerprint, publishedAt: 'fixture-time' });
  writeWeixinBuildState(f.root, f.destination, { status: 'error', reason: 'build-failed' });
  const state = readWeixinBuildState(f.root, f.destination);
  assert.equal(state.status, 'error');
  assert.equal(state.sourceFingerprint, fingerprint);
  assert.equal(state.publishedAt, 'fixture-time');
  assert.equal(readWeixinBuildState(f.root, release), null);
  const { workspace, stateFile } = weixinStatePaths(f.root, f.destination);
  const saved = fs.readFileSync(stateFile, 'utf8');
  assert.doesNotMatch(saved, /MOCK_TOKEN|fixture-secret|fixture-only/);
  assert.deepEqual(fs.readdirSync(workspace), [path.basename(stateFile)]);
  fs.writeFileSync(stateFile, '{bad private value');
  assert.throws(() => readWeixinBuildState(f.root, f.destination), error => /状态损坏/.test(error.message) && !error.message.includes('private value'));
  writeWeixinBuildState(f.root, f.destination, { status: 'building' });
  assert.equal(readWeixinBuildState(f.root, f.destination).status, 'building');
  assert.equal(readWeixinBuildState(f.root, f.destination).sourceFingerprint, null);
});

test('原子保存期间文件瞬时消失会重试整轮快照，持续缺失最多重试三次', t => {
  const f = fixture(t);
  f.write('src/page.uvue', 'fixture');
  const expected = weixinSourceFingerprint(f.root);
  const target = path.join(f.root, 'src/page.uvue'), original = fs.readFileSync;
  let attempts = 0;
  const mocked = t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (file === target && ++attempts <= 3) throw Object.assign(new Error('fixture atomic rename'), { code: 'ENOENT' });
    return original.call(this, file, ...args);
  });
  assert.equal(weixinSourceFingerprint(f.root), expected);
  assert.equal(attempts, 4);
  mocked.mock.restore();
  attempts = 0;
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (file === target) { attempts++; throw Object.assign(new Error('fixture unavailable'), { code: 'ENOENT' }); }
    return original.call(this, file, ...args);
  });
  assert.throws(() => weixinSourceFingerprint(f.root), { code: 'ENOENT' });
  assert.equal(attempts, 4);
});

test('构建期间的源码变化不会冒充最新，失败保留已发布指纹，静态同步只确认实际复制的变化', async t => {
  const f = fixture(t), staging = path.join(f.root, 'staging');
  f.write('src/page.uvue', '<view>first</view>');
  f.write('src/theme.json', '{"light":{"color":"#fff"},"dark":{"color":"#000"}}');
  for (const [name, content] of Object.entries({
    'app.json': '{"pages":[],"themeLocation":"theme.json"}', 'app.js': 'App({});',
    'uvue.wxss': '.fixture {}', 'project.config.json': '{"appid":""}',
    'theme.json': fs.readFileSync(path.join(f.root, 'src/theme.json')),
  })) f.write('staging/' + name, content);
  const plugin = weixinOutput(), errors = [];
  const env = Object.fromEntries(['UNI_OUTPUT_DIR', 'AIO_WEIXIN_OUTPUT_DIR', 'AIO_WEIXIN_RESULT_FILE', 'AIO_WEIXIN_MODE', 'AIO_WEIXIN_LAUNCHER_PID']
    .map(name => [name, process.env[name]]));
  process.env.UNI_OUTPUT_DIR = staging;
  process.env.AIO_WEIXIN_OUTPUT_DIR = f.destination;
  delete process.env.AIO_WEIXIN_RESULT_FILE;
  delete process.env.AIO_WEIXIN_MODE;
  delete process.env.AIO_WEIXIN_LAUNCHER_PID;
  f.cleanup.push(() => {
    plugin.closeWatcher();
    for (const [name, value] of Object.entries(env)) {
      if (value == null) delete process.env[name]; else process.env[name] = value;
    }
  });
  plugin.configResolved({ root: f.root, build: { outDir: staging, watch: {} }, logger: { error: value => errors.push(value) } });
  plugin.buildStart();
  const before = weixinSourceFingerprint(f.root);
  assert.equal(readWeixinBuildState(f.root, f.destination).buildingFingerprint, before);
  f.write('src/page.uvue', '<view>second</view>');
  plugin.writeBundle.handler();
  assert.equal(readWeixinBuildState(f.root, f.destination).sourceFingerprint, before);
  assert.notEqual(before, weixinSourceFingerprint(f.root));
  plugin.buildStart();
  plugin.buildEnd(new Error('fixture failure with confidential contents'));
  assert.equal(readWeixinBuildState(f.root, f.destination).status, 'error');
  assert.equal(readWeixinBuildState(f.root, f.destination).sourceFingerprint, before);
  assert.equal(fs.readFileSync(path.join(f.destination, 'app.js'), 'utf8'), 'App({});');
  plugin.buildStart();
  plugin.writeBundle.handler();
  const successful = readWeixinBuildState(f.root, f.destination);
  assert.equal(successful.status, 'ready');
  assert.equal(successful.sourceFingerprint, weixinSourceFingerprint(f.root));
  async function waitForTheme(color) {
    const deadline = Date.now() + 3000;
    while (JSON.parse(fs.readFileSync(path.join(f.destination, 'theme.json'))).light.color !== color && Date.now() < deadline) await delay(20);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'theme.json'))).light.color, color);
  }
  const theme = color => JSON.stringify({ light: { color }, dark: { color: '#000' } });
  f.write('src/theme.json', theme('#eee'));
  f.write('staging/theme.json', theme('#eee'));
  await waitForTheme('#eee');
  assert.equal(readWeixinBuildState(f.root, f.destination).sourceFingerprint, weixinSourceFingerprint(f.root));
  const staticFingerprint = readWeixinBuildState(f.root, f.destination).sourceFingerprint;
  f.write('src/page.uvue', '<view>pending-code-change</view>');
  f.write('src/theme.json', theme('#ddd'));
  f.write('staging/theme.json', theme('#ddd'));
  await waitForTheme('#ddd');
  assert.equal(readWeixinBuildState(f.root, f.destination).sourceFingerprint, staticFingerprint);
  assert.notEqual(staticFingerprint, weixinSourceFingerprint(f.root));
  assert.deepEqual(errors, []);
});
