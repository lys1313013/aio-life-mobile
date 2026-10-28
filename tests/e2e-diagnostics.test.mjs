import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import diagnostics from './e2e/support/diagnostics.cjs';
import Reporter from '../scripts/e2e-summary-reporter.cjs';

test('诊断路径去掉查询值、片段参数和动态 ID，不收集凭据或正文', () => {
  assert.equal(diagnostics.safePath('https://example.test/api/users/9223372036854775807?token=secret'), '/api/users/:value');
  assert.equal(diagnostics.safePath('https://example.test/#/pages/auth/policy?email=private@example.test'), '/pages/auth/policy');
  assert.equal(diagnostics.safePath('https://example.test/api/user/private%40example.test'), '/api/user/:value');
  assert.equal(diagnostics.safePath('invalid'), '(unknown)');
});

test('请求记录有界，并区分 HTTP 响应、请求结束和仍未结束的请求', () => {
  const recorder = diagnostics.createRecorder(3);
  const request = { url: () => 'https://example.test/api/auth/legal?private=secret', method: () => 'GET' };
  const other = { url: () => 'https://example.test/api/goals', method: () => 'GET' };
  recorder.request(request);
  recorder.response({ request: () => request, status: () => 403 });
  assert.equal(recorder.snapshot().pending.length, 1);
  recorder.finish(request, true);
  recorder.request(other);
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.events.length, 3);
  assert.equal(snapshot.dropped, 1);
  assert.deepEqual(snapshot.events.map(event => event.type), ['response', 'requestfailed', 'request']);
  assert.deepEqual(snapshot.pending.map(event => event.path), ['/api/goals']);
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
  recorder.finish(other);
  assert.equal(recorder.snapshot().pending.length, 0);
});

function fakeTest(title, { line = 20, declaration = 10, outcome = 'unexpected', results } = {}) {
  return {
    titlePath: () => [title], expectedStatus: 'passed', outcome: () => outcome,
    location: { file: '/repo/tests/e2e/example.spec.js', line: declaration, column: 1 },
    results: results || [{ status: 'failed', retry: 0, attachments: [], steps: [{
      titlePath: () => ['打开协议', 'expect.toBeVisible'], category: 'expect', error: {}, steps: [],
      location: { file: '/repo/tests/e2e/example.spec.js', line, column: 3 },
    }] }],
  };
}

test('矩阵同一失败位置归组，但不同断言和不同测试声明不合并', () => {
  const suite = { allTests: () => [fakeTest('390 light'), fakeTest('768 dark'), fakeTest('另一个断言', { line: 30 }), fakeTest('其他流程', { declaration: 40 })] };
  const result = Reporter.summaryFor(suite, '/repo', { status: 'failed' }, [], null);
  assert.equal(result.counts.unexpected, 4);
  assert.deepEqual(result.groups.map(group => group.cases.length), [2, 1, 1]);
  assert.match(Reporter.markdown(result), /不代表已经确认根因/);
});

test('摘要保留重试后通过、跳过、中断及运行器错误，不把它们伪装成全通过', () => {
  const flaky = fakeTest('flaky', { outcome: 'flaky' });
  flaky.results.push({ status: 'passed', retry: 1, attachments: [], steps: [] });
  const skipped = fakeTest('skipped', { outcome: 'skipped', results: [{ status: 'skipped' }] });
  const result = Reporter.summaryFor({ allTests: () => [flaky, skipped] }, '/repo', { status: 'interrupted' }, ['preview failed'], null);
  assert.equal(result.counts.flaky, 1);
  assert.equal(result.counts.skipped, 1);
  assert.equal(result.groups.length, 1);
  assert.equal(result.status, 'interrupted');
  assert.match(Reporter.markdown(result), /preview failed/);
});

test('新运行先清除旧摘要，服务启动失败也留下独立的本次诊断', () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), 'e2e-diagnostics-'));
  const previousSummary = process.env.GITHUB_STEP_SUMMARY;
  delete process.env.GITHUB_STEP_SUMMARY;
  try {
    writeFileSync(path.join(outputDir, 'summary.json'), '{"status":"passed"}');
    const reporter = new Reporter({ root: '/repo', outputDir });
    reporter.onBegin({ shard: { current: 2, total: 4 } }, { allTests: () => [] });
    assert.equal(existsSync(path.join(outputDir, 'summary.json')), false);
    reporter.onError({ message: 'preview failed' });
    assert.equal(reporter.onEnd({ status: 'failed' }), undefined);
    const result = JSON.parse(readFileSync(path.join(outputDir, 'summary.json'), 'utf8'));
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.globalErrors, ['preview failed']);
    assert.deepEqual(result.shard, { current: 2, total: 4 });
  } finally {
    if (previousSummary !== undefined) process.env.GITHUB_STEP_SUMMARY = previousSummary;
    rmSync(outputDir, { recursive: true, force: true });
  }
});
