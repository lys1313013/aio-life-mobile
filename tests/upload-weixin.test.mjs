import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const source = fs.readFileSync(new URL('../scripts/upload-weixin.cjs', import.meta.url), 'utf8');
const fixtureAppId = 'wx0000000000000000';
function harness(manager, { statuses = [], args = [], mismatch = false, userAgent = '' } = {}) {
  const calls = [], errors = [];
  let exitStatus;
  const processFixture = { execPath: process.execPath, env: { npm_execpath: manager, npm_config_user_agent: userAgent },
    exit(code) { exitStatus = code; throw new Error('fixture process exit'); } };
  const modules = {
    'node:child_process': { spawnSync(command, args, options) { calls.push({ command, args, options }); return { status: statuses[calls.length - 1] ?? 0 }; } },
    'node:fs': { constants: fs.constants, accessSync() {}, readFileSync(file) {
      return JSON.stringify({ appid: mismatch && file.includes('dist') ? 'wx0000000000000001' : fixtureAppId });
    } },
    'node:util': { parseArgs: options => parseArgs({ ...options, args }) },
  };
  vm.runInNewContext(source, {
    require: name => modules[name] || require(name), __dirname: path.join(root, 'scripts'),
    process: processFixture, console: { log() {}, error: text => errors.push(text) },
  });
  return { calls, errors, process: processFixture, exitStatus };
}

test('npm 上传保持 pre/post 钩子，构建检查完成后才上传，并保留说明原文', () => {
  const desc = '模拟更新：空格、引号 " 和 $(literal)';
  const h = harness('/fixture/npm-cli.js', { args: ['--desc', desc] });
  assert.equal(h.process.exitCode, undefined);
  assert.deepEqual(Array.from(h.calls[0].args), ['/fixture/npm-cli.js', '--ignore-scripts=false', 'run', 'build:weixin']);
  assert.deepEqual(Array.from(h.calls[1].args), ['upload', '--project', path.join(root, 'dist/build/mp-weixin'), '--version', '0.9.0', '--desc', desc]);
});

test('pnpm 使用专属配置参数，兼容 CLI 路径和包管理器标识', () => {
  for (const [cli, userAgent] of [['/fixture/pnpm.cjs', ''], ['C:\\fixture\\pnpm.exe', ''], ['/fixture/wrapper.js', 'pnpm/10.20.0 npm/? node/v22.21.1']]) {
    const h = harness(cli, { userAgent });
    assert.equal(h.calls.length, 2);
    assert.deepEqual(Array.from(h.calls[0].args), [cli, '--config.ignore-scripts=false', '--config.enable-pre-post-scripts=true', 'run', 'build:weixin']);
  }
});

test('构建或包体检查失败时立即停止，不调用微信上传', () => {
  for (const manager of ['/fixture/npm-cli.js', '/fixture/pnpm.cjs']) {
    const h = harness(manager, { statuses: [7] });
    assert.equal(h.calls.length, 1);
    assert.equal(h.exitStatus, 7);
    assert.ok(h.errors.some(message => message.includes('构建或包体检查失败')));
  }
});

test('AppID 不一致或说明为空时阻断上传；help 不触发构建与上传', () => {
  assert.equal(harness('pnpm', { mismatch: true }).calls.length, 1);
  assert.equal(harness('pnpm', { args: ['--desc', ' '] }).calls.length, 0);
  const h = harness('pnpm', { args: ['--help'] });
  assert.equal(h.calls.length, 0);
  assert.equal(h.process.exitCode, undefined);
});

for (const manager of ['npm', 'pnpm']) test(`${manager} 真实 CLI 在禁用钩子的本地配置下仍按顺序执行生成、构建和检查`, t => {
  // 只有临时包、模拟脚本与模拟 AppID，不编译项目、不访问网络、不调用微信 CLI。
  const probe = spawnSync(manager, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (probe.error?.code === 'ENOENT') return t.skip(`环境未安装 ${manager}`);
  assert.equal(probe.status, 0, probe.stderr);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-upload-lifecycle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'explicit-upload-fixture', private: true, scripts: {
    'prebuild:weixin': 'node record.cjs generate', 'build:weixin': 'node record.cjs build', 'postbuild:weixin': 'node record.cjs size-check',
  } }));
  fs.writeFileSync(path.join(directory, '.npmrc'), 'ignore-scripts=true\nenable-pre-post-scripts=false\n');
  fs.writeFileSync(path.join(directory, 'record.cjs'), "require('node:fs').appendFileSync('events.log', process.argv[2] + '\\n');\n");
  const build = harness(manager).calls[0];
  const result = spawnSync(manager, Array.from(build.args).slice(1), { cwd: directory, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_enable_pre_post_scripts: 'false' } });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'events.log'), 'utf8').trim().split('\n'), ['generate', 'build', 'size-check']);
});
