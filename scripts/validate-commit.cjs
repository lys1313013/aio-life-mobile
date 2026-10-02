const { spawnSync } = require('node:child_process');
const { closeSync, mkdirSync, openSync, readFileSync } = require('node:fs');
const path = require('node:path');

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('请使用 npm run test:commit 执行提交前验证。');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const output = path.join(root, 'artifacts', 'commit-validation', runId);
mkdirSync(output, { recursive: true });

const stages = [
  { name: '单元与规范检查', args: ['test'], log: '01-unit.log' },
  // Playwright 的 webServer 会构建 H5，避免在这里重复构建。
  { name: 'H5 构建与完整 E2E', args: ['run', 'test:e2e'], log: '02-e2e.log' },
  { name: '微信构建与包体检查', args: ['run', 'build:weixin'], log: '03-weixin.log' },
];

console.log(`提交前验证日志：${output}`);
for (const [index, stage] of stages.entries()) {
  const logPath = path.join(output, stage.log);
  console.log(`[${index + 1}/${stages.length}] ${stage.name}，日志：${logPath}`);
  const started = Date.now();
  const fd = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, [npmCli, ...stage.args], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error || result.status !== 0) {
    console.error(`失败：${stage.name}（${seconds}s）；后续阶段未执行。`);
    if (result.error) console.error(result.error.message);
    if (result.signal) console.error(`终止信号：${result.signal}`);
    const tail = readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-35).join('\n');
    console.error(tail.slice(-6000));
    console.error(`完整日志：${logPath}`);
    process.exit(result.status || 1);
  }
  console.log(`通过：${stage.name}（${seconds}s）`);
}
console.log('提交前验证全部通过（模拟 API 的 H5 回归及编译检查，不代表真机验证）。');
