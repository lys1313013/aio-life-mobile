const fs = require('node:fs');
const path = require('node:path');
const { stripVTControlCharacters } = require('node:util');

function failedStep(steps) {
  for (const step of steps || []) {
    const child = failedStep(step.steps);
    if (child) return child;
    if (step.error) return step;
  }
}
function relativeLocation(root, location) {
  if (!location) return '(unknown)';
  return `${path.relative(root, location.file)}:${location.line}:${location.column || 1}`;
}
function summaryFor(suite, root, run, globalErrors, shard) {
  const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  const groups = new Map();
  for (const test of suite.allTests()) {
    counts[test.outcome()]++;
    for (const result of test.results) {
      if (result.status === test.expectedStatus || result.status === 'skipped') continue;
      const step = failedStep(result.steps);
      const declaration = relativeLocation(root, test.location);
      const failure = relativeLocation(root, step?.location || result.errors?.[0]?.location || test.location);
      // 按测试声明 + 失败位置 + 状态分组，不把不同断言或不同测试合并成“同一根因”。
      const key = `${declaration}|${failure}|${result.status}`;
      if (!groups.has(key)) groups.set(key, { declaration, failure, status: result.status, cases: [] });
      groups.get(key).cases.push({
        title: test.titlePath().join(' › '),
        step: step?.titlePath().join(' › ') || '(before test / runner)',
        retry: result.retry,
        outcome: test.outcome(),
        error: stripVTControlCharacters(result.errors?.[0]?.message || '').slice(0, 2000),
        attachments: result.attachments.filter(item => item.path).map(item => ({
          name: item.name, path: path.relative(root, item.path),
        })),
      });
    }
  }
  return { status: run.status, startedAt: run.startTime?.toISOString(), durationMs: run.duration, shard, counts, globalErrors, groups: [...groups.values()] };
}
const cell = value => String(value).replace(/[\r\n|`<>]/g, ' ');
function markdown(summary) {
  const lines = [
    `## Mobile E2E${summary.shard ? ` — 分片 ${summary.shard.current}/${summary.shard.total}` : ''}`,
    '',
    `结果：${summary.status}；符合预期 ${summary.counts.expected}，失败 ${summary.counts.unexpected}，重试后通过 ${summary.counts.flaky}，跳过 ${summary.counts.skipped}。`,
    '',
    `共 ${summary.groups.length} 个首个失败位置分组（仅用于排查，不代表已经确认根因）。`,
  ];
  if (summary.globalErrors.length) lines.push('', '运行器/服务启动错误：', ...summary.globalErrors.map(message => `- ${cell(message).slice(0, 500)}`));
  if (summary.groups.length) {
    lines.push('', '| 失败位置 | 次数 | 示例用例 / 步骤 |', '| --- | ---: | --- |');
    for (const group of summary.groups) {
      const example = group.cases[0];
      lines.push(`| ${cell(group.failure)} | ${group.cases.length} | ${cell(example.title)} / ${cell(example.step)} |`);
    }
  }
  lines.push('', '详情：artifacts/e2e-diagnostics/summary.json；HTML 报告中的 failure-context 附件记录 API 状态、未完成请求及页面路径。结合 trace/截图判断页面、fixture、定位器或环境问题；HTTP 错误也可能是用例故意模拟的。', '');
  return lines.join('\n');
}

class E2ESummaryReporter {
  constructor(options = {}) {
    this.globalErrors = [];
    this.root = options.root || path.resolve(__dirname, '..');
    this.output = options.outputDir || path.join(this.root, 'artifacts/e2e-diagnostics');
    if (process.argv.includes('--list')) return;
    // 本次运行即使在 onEnd 前被杀死，也不能留下上次的“通过”摘要。
    for (const file of ['summary.json', 'summary.md']) fs.rmSync(path.join(this.output, file), { force: true });
  }
  onBegin(config, suite) { this.config = config; this.suite = suite; }
  onError(error) { this.globalErrors.push(error.message || 'Unknown runner error'); }
  onEnd(run) {
    if (!this.suite || process.argv.includes('--list')) return;
    const root = this.root;
    const output = this.output;
    const summary = summaryFor(this.suite, root, run, this.globalErrors, this.config.shard);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'summary.md'), markdown(summary));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(summary));
    // 不修改 Playwright 的结果；flaky/中断/启动失败均如实记录。
  }
  printsToStdio() { return false; }
}

module.exports = E2ESummaryReporter;
module.exports.summaryFor = summaryFor;
module.exports.markdown = markdown;
