import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = fs.readFileSync(new URL('../scripts/validate-commit.cjs', import.meta.url), 'utf8');

function runValidation(statuses = []) {
  const calls = [];
  const env = { npm_execpath: '/fixture/npm-cli.js', AIO_E2E_PREBUILT: '1', PLAYWRIGHT_WORKERS: '4' };
  let exitStatus;
  const stopped = new Error('fixture exit');
  try {
    vm.runInNewContext(source, {
      __dirname: path.join(root, 'scripts'),
      process: { env, execPath: process.execPath, pid: 1, exit(code) { exitStatus = code; throw stopped; } },
      console: { log() {}, error() {} },
      require(name) {
        if (name === 'node:path') return path;
        if (name === 'node:fs') return { mkdirSync() {}, openSync() { return 1; }, closeSync() {}, readFileSync() { return 'fixture failure'; } };
        if (name === 'node:child_process') return { spawnSync(command, args, options) {
          calls.push({ command, args, options });
          return { status: statuses[calls.length - 1] ?? 0 };
        } };
        throw new Error(`Unexpected module: ${name}`);
      },
    });
  } catch (error) {
    if (error !== stopped) throw error;
  }
  return { calls, env, exitStatus };
}

test('提交前验证关闭旧 H5 产物复用，同时保留指定并发度及父进程环境', () => {
  const { calls, env } = runValidation();
  assert.deepEqual(calls.map(call => Array.from(call.args).slice(1)), [['test'], ['run', 'test:e2e'], ['run', 'build:weixin']]);
  for (const { options } of calls) {
    assert.equal(options.env.AIO_E2E_PREBUILT, '0');
    assert.equal(options.env.PLAYWRIGHT_WORKERS, '4');
  }
  assert.equal(env.AIO_E2E_PREBUILT, '1');
});

test('提交前任一阶段失败时停止后续检查并保留失败状态', () => {
  for (const statuses of [[7], [0, 8], [0, 0, 9]]) {
    const { calls, exitStatus } = runValidation(statuses);
    assert.equal(calls.length, statuses.length);
    assert.equal(exitStatus, statuses.at(-1));
  }
});
