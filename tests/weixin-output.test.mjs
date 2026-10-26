import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { publishWeixinOutput, weixinOutput } from '../scripts/weixin-output.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-output-')));
  const cleanup = [];
  t.after(async () => {
    for (const dispose of cleanup) await dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const staging = path.join(root, 'staging'), destination = path.join(root, 'published');
  fs.mkdirSync(staging);
  const write = (name, content, directory = staging) => {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), content);
  };
  for (const [name, content] of Object.entries({
    'app.json': JSON.stringify({ pages: ['pages/home/index'], themeLocation: 'theme.json',
      tabBar: { list: [{ iconPath: 'static/tab.png' }] } }),
    'app.js': 'App({});', 'uvue.wxss': '.fixture {}',
    'project.config.json': '{"appid":"","compileType":"miniprogram"}',
    'theme.json': '{"light":{"color":"#fff"},"dark":{"color":"#000"}}',
    'pages/home/index.js': 'Page({});', 'pages/home/index.json': '{}',
    'pages/home/index.wxml': '<view>fixture</view>', 'static/tab.png': Buffer.from([0, 1, 2, 255]),
  })) write(name, content);
  return { root, staging, destination, write, cleanup };
}

test('完整产物先验证再同步，未变化的主题和资源不重写，私有设置不被覆盖', t => {
  const f = fixture(t);
  publishWeixinOutput(f.staging, f.destination);
  const theme = path.join(f.destination, 'theme.json'), stat = fs.statSync(theme);
  f.write('project.private.config.json', '{"setting":{"compileHotReLoad":true}}', f.destination);
  f.write('project.private.config.json', '{"setting":{"compileHotReLoad":false}}');
  f.write('removed/stale.js', 'old', f.destination);
  f.write('app.js', 'App({ fixture: 2 });');
  assert.equal(publishWeixinOutput(f.staging, f.destination), 1);
  assert.equal(fs.statSync(theme).mtimeMs, stat.mtimeMs);
  assert.equal(fs.statSync(theme).ino, stat.ino);
  assert.deepEqual(fs.readFileSync(path.join(f.destination, 'static/tab.png')), Buffer.from([0, 1, 2, 255]));
  assert.equal(fs.existsSync(path.join(f.destination, 'removed/stale.js')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'project.private.config.json'))).setting.compileHotReLoad, true);
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.weixin-publish-')), false);
});

test('主题、页面、底栏图标缺失或 JSON 损坏时保留完整旧产物，不发布半成品', t => {
  const f = fixture(t);
  publishWeixinOutput(f.staging, f.destination);
  f.write('app.js', 'App({ fixture: "must not publish" });');
  for (const name of ['theme.json', 'pages/home/index.wxml', 'static/tab.png', 'uvue.wxss']) {
    const file = path.join(f.staging, name), original = fs.readFileSync(file);
    fs.unlinkSync(file);
    assert.throws(() => publishWeixinOutput(f.staging, f.destination), /微信产物不完整/);
    assert.equal(fs.readFileSync(path.join(f.destination, 'app.js'), 'utf8'), 'App({});');
    f.write(name, original);
  }
  f.write('pages/home/index.json', '{ invalid JSON');
  assert.throws(() => publishWeixinOutput(f.staging, f.destination), SyntaxError);
  assert.equal(fs.readFileSync(path.join(f.destination, 'app.js'), 'utf8'), 'App({});');
});

test('清空隔离目录和失败编译均不影响开发目录；成功后同步并继续监听静态主题变化', async t => {
  const f = fixture(t);
  publishWeixinOutput(f.staging, f.destination);
  const plugin = weixinOutput(), errors = [];
  const env = { UNI_OUTPUT_DIR: process.env.UNI_OUTPUT_DIR, AIO_WEIXIN_OUTPUT_DIR: process.env.AIO_WEIXIN_OUTPUT_DIR };
  process.env.UNI_OUTPUT_DIR = f.staging;
  process.env.AIO_WEIXIN_OUTPUT_DIR = f.destination;
  f.cleanup.push(() => {
    plugin.closeWatcher();
    for (const [name, value] of Object.entries(env)) {
      if (value == null) delete process.env[name]; else process.env[name] = value;
    }
  });
  plugin.configResolved({ build: { outDir: f.staging, watch: {} }, logger: { error: text => errors.push(text) } });
  assert.equal(plugin.writeBundle.order, 'post');
  assert.equal(plugin.writeBundle.sequential, true);
  plugin.buildStart();
  const theme = fs.readFileSync(path.join(f.staging, 'theme.json'));
  fs.unlinkSync(path.join(f.staging, 'theme.json'));
  plugin.buildEnd(new Error('explicit compiler failure'));
  f.write('theme.json', theme);
  f.write('app.js', 'App({ fixture: 2 });');
  await delay(220);
  assert.equal(fs.readFileSync(path.join(f.destination, 'app.js'), 'utf8'), 'App({});');
  assert.ok(fs.existsSync(path.join(f.destination, 'theme.json')));
  plugin.buildStart();
  plugin.buildEnd();
  plugin.writeBundle.handler();
  assert.match(fs.readFileSync(path.join(f.destination, 'app.js'), 'utf8'), /fixture: 2/);
  f.write('theme.json', '{"light":{"color":"#eee"},"dark":{"color":"#111"}}');
  const deadline = Date.now() + 3000;
  while (JSON.parse(fs.readFileSync(path.join(f.destination, 'theme.json'))).light.color !== '#eee' && Date.now() < deadline) await delay(30);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.destination, 'theme.json'))).light.color, '#eee');
  // New directories and same-path inode replacements must remain watched.
  const nested = 'static/new/icons/fixture.png';
  f.write(nested, 'first');
  async function waitForAsset(expected) {
    const target = path.join(f.destination, nested), deadline = Date.now() + 3000;
    while ((!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) && Date.now() < deadline) await delay(30);
    assert.equal(fs.readFileSync(target, 'utf8'), expected);
  }
  await waitForAsset('first');
  fs.unlinkSync(path.join(f.staging, nested));
  f.write(nested, 'replacement');
  await waitForAsset('replacement');
  f.write(nested, 'updated');
  await waitForAsset('updated');
  assert.deepEqual(errors, []);
});

test('两个真实启动器不能同时发布同一目录；退出后清理隔离目录与锁', async t => {
  const f = fixture(t);
  const scripts = path.join(f.root, 'scripts');
  fs.mkdirSync(scripts);
  fs.copyFileSync(new URL('../scripts/run-weixin.mjs', import.meta.url), path.join(scripts, 'run-weixin.mjs'));
  const bin = path.join(f.root, 'node_modules/@dcloudio/vite-plugin-uni/bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'uni.js'), `
const fs = require('node:fs');
fs.writeFileSync('probe.json', JSON.stringify({ output: process.env.UNI_OUTPUT_DIR, published: process.env.AIO_WEIXIN_OUTPUT_DIR, args: process.argv.slice(2) }));
console.log('FIXTURE_READY');
setInterval(() => {}, 1000);
`);
  const entry = path.join(scripts, 'run-weixin.mjs');
  const child = spawn(process.execPath, [entry, 'dev', '--outDir', 'custom-output'], { cwd: f.root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  f.cleanup.push(async () => { child.kill('SIGTERM'); await exited; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('fixture did not start')), 5000);
    child.stdout.on('data', data => { if (data.toString().includes('FIXTURE_READY')) { clearTimeout(timeout); resolve(); } });
    child.once('error', reject);
  });
  const probe = JSON.parse(fs.readFileSync(path.join(f.root, 'probe.json')));
  assert.notEqual(probe.output, probe.published);
  assert.equal(probe.published, path.join(f.root, 'custom-output'));
  assert.deepEqual(probe.args, ['-p', 'mp-weixin']);
  const second = spawn(process.execPath, [entry, 'dev', '--outDir', 'custom-output'], { cwd: f.root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  second.stderr.on('data', data => stderr += data);
  const status = await new Promise(resolve => second.once('exit', resolve));
  assert.equal(status, 1);
  assert.match(stderr, /已有微信编译进程/);
  child.kill('SIGTERM');
  await exited;
  assert.equal(fs.existsSync(probe.output), false);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'artifacts/weixin-output')), []);
  // A compiler that exits successfully without the publishing plugin must not
  // let npm postbuild validate yesterday's output and then upload it.
  fs.writeFileSync(path.join(bin, 'uni.js'), 'process.exit(0);');
  const missingPublish = spawn(process.execPath, [entry, 'build'], { cwd: f.root, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure = '';
  missingPublish.stderr.on('data', data => failure += data);
  assert.equal(await new Promise(resolve => missingPublish.once('exit', resolve)), 1);
  assert.match(failure, /微信编译未完成产物同步/);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'artifacts/weixin-output')), []);
});
