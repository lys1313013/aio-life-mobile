import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const alive = pid => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-manager-')));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'src'));
  for (const name of ['weixin-dev.mjs', 'weixin-build-state.mjs']) {
    fs.copyFileSync(new URL('../scripts/' + name, import.meta.url), path.join(root, 'scripts', name));
  }
  for (const name of ['generate-spacing.cjs', 'generate-typography.cjs', 'generate-weixin-tab-bar.cjs']) {
    fs.writeFileSync(path.join(root, 'scripts', name), '// fixture: generated config is already current\n');
  }
  fs.writeFileSync(path.join(root, 'src/page.uvue'), 'version one');
  const cli = path.join(root, 'fixture-cli.cjs');
  fs.writeFileSync(cli, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'cli-args.json'))}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'scripts/run-weixin.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
import { weixinSourceFingerprint, writeWeixinBuildState } from './weixin-build-state.mjs';
const root = process.cwd(), destination = process.env.UNI_OUTPUT_DIR;
const launches = path.join(root, 'launches.json');
fs.writeFileSync(launches, JSON.stringify([...(fs.existsSync(launches) ? JSON.parse(fs.readFileSync(launches)) : []), process.pid]));
const update = patch => writeWeixinBuildState(root, destination, { launcherPid: process.pid, compilerPid: process.pid, ...patch });
function publish() {
  update({ status: 'building', buildStartedAt: new Date().toISOString() });
  const source = fs.readFileSync(path.join(root, 'src/page.uvue'), 'utf8');
  if (source === 'broken') { update({ status: 'error' }); return; }
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['app.js', 'app.json', 'uvue.wxss', 'project.config.json']) fs.writeFileSync(path.join(destination, name), source);
  update({ status: 'ready', sourceFingerprint: weixinSourceFingerprint(root), publishedAt: new Date().toISOString() });
}
publish();
const timer = setInterval(() => {
  const control = path.join(root, 'control.json');
  if (!fs.existsSync(control)) return;
  const action = JSON.parse(fs.readFileSync(control)).action;
  fs.unlinkSync(control);
  if (action === 'crash') process.exit(17);
  if (action === 'sync') publish();
}, 100);
process.on('SIGTERM', () => { clearInterval(timer); update({ status: 'stopped' }); process.exit(0); });
`);
  const managerFile = path.join(root, 'artifacts/weixin-output/dev-manager.json');
  const entry = path.join(root, 'scripts/weixin-dev.mjs');
  function run(command, env = {}) {
    const child = spawn(process.execPath, [entry, command], {
      cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${command} timed out\n${stdout}\n${stderr}`)); }, 35000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
  }
  const pids = () => fs.existsSync(path.join(root, 'launches.json'))
    ? JSON.parse(fs.readFileSync(path.join(root, 'launches.json'))) : [];
  t.after(async () => {
    await run('stop');
    // In a failing test, only terminate PIDs recorded by this isolated fixture.
    for (const pid of pids()) if (alive(pid)) process.kill(pid, 'SIGTERM');
    if (fs.existsSync(managerFile)) {
      const manager = JSON.parse(fs.readFileSync(managerFile));
      if (alive(manager.pid)) process.kill(manager.pid, 'SIGTERM');
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root, run, pids, managerFile, cli,
    source: text => fs.writeFileSync(path.join(root, 'src/page.uvue'), text),
    control: action => fs.writeFileSync(path.join(root, 'control.json'), JSON.stringify({ action })),
    output: () => fs.readFileSync(path.join(root, 'dist/dev/mp-weixin/app.js'), 'utf8'),
  };
}

async function eventually(check, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail('expected background condition before deadline');
}

test('后台启动等待当前产物、重复启动复用、状态识别旧源码、停止后不再报告最新', async t => {
  const f = fixture(t);
  const started = await f.run('start', { UNI_OUTPUT_DIR: path.join(f.root, 'wrong-release-output') });
  assert.equal(started.code, 0, started.stderr);
  assert.match(started.stdout, /与当前源码一致/);
  assert.equal(f.output(), 'version one');
  assert.equal(fs.existsSync(path.join(f.root, 'wrong-release-output')), false);
  assert.equal((await f.run('start')).code, 0);
  assert.equal(f.pids().length, 1);
  const opened = await f.run('open', { WECHAT_DEVTOOLS_CLI: f.cli });
  assert.equal(opened.code, 0, opened.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'cli-args.json'))), ['open', '--project', path.join(f.root, 'dist/dev/mp-weixin')]);
  assert.equal((await f.run('status')).code, 0);
  f.source('version two');
  const stale = await f.run('status');
  assert.equal(stale.code, 1);
  assert.match(stale.stdout, /与当前源码一致：否/);
  f.control('sync');
  await eventually(() => f.output() === 'version two');
  assert.equal((await f.run('status')).code, 0);
  const compiler = f.pids()[0];
  const stopped = await f.run('stop');
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(fs.existsSync(f.managerFile), false);
  await eventually(() => !alive(compiler));
  assert.equal((await f.run('status')).code, 1);
});

test('后台恢复编译器意外退出，并对漏掉的源码事件重新完整构建', async t => {
  const f = fixture(t);
  assert.equal((await f.run('start')).code, 0);
  f.control('crash');
  await eventually(() => f.pids().length === 2);
  await eventually(async () => (await f.run('status')).code === 0);
  f.source('version after missed watch');
  assert.equal((await f.run('status')).code, 1);
  await eventually(() => f.output() === 'version after missed watch');
  assert.equal(f.pids().length, 3);
  assert.equal((await f.run('status')).code, 0);
});

test('编译失败保留旧产物，不能把旧状态当作当前成功，修复后恢复', async t => {
  const f = fixture(t);
  assert.equal((await f.run('start')).code, 0);
  f.source('broken');
  f.control('sync');
  await eventually(async () => /开发编译：error/.test((await f.run('status')).stdout));
  const started = await f.run('start');
  assert.equal(started.code, 1);
  assert.match(started.stderr, /编译失败/);
  assert.equal(f.output(), 'version one');
  f.source('repaired');
  f.control('sync');
  await eventually(() => f.output() === 'repaired');
  assert.equal((await f.run('status')).code, 0);
});

test('配置变化即使增量报告成功仍必须重新启动完整编译', async t => {
  const f = fixture(t);
  assert.equal((await f.run('start')).code, 0);
  fs.writeFileSync(path.join(f.root, '.env.local'), 'VITE_FIXTURE=changed\n');
  // Model a compiler which retains cached config but stamps the current source hash.
  f.control('sync');
  await delay(250);
  const stale = await f.run('status');
  assert.equal(stale.code, 1, 'cached configuration must not be reported as current');
  await eventually(() => f.pids().length === 2);
  await eventually(async () => (await f.run('status')).code === 0);
});
