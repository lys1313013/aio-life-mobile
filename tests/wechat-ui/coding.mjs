// 仅在忽略目录中将 coding 服务按微信条件预编译，使用 H5 页面验证数据与错误恢复。
// 所有业务请求均为模拟数据；不替代微信模拟器或真机验证。
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import fixtures from '../e2e/fixtures.js';

const require = createRequire(import.meta.url);
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess');
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/coding-weixin-fix/ui');
const project = path.join(output, 'project');
await mkdir(output, { recursive: true });
await rm(project, { recursive: true, force: true });
await mkdir(project);
await cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true });
for (const file of ['package.json', 'vite.config.js', 'index.html', 'tsconfig.json', 'scripts']) await cp(path.join(root, file), path.join(project, file), { recursive: true });
await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'));
const servicePath = path.join(project, 'src/pages/coding/services/coding.ts');
await writeFile(servicePath, preprocess(await readFile(servicePath, 'utf8'),
  initScopedPreContext('mp-weixin', {}, undefined, true).preUVueContext, { type: 'js' }));
const origin = 'http://127.0.0.1:5191';
const server = spawn(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
  '-p', 'h5', '--host', '127.0.0.1', '--port', '5191', '--strictPort'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser;
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 480; i++) {
    if (server.exitCode != null) throw new Error(logs);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
    const page = await context.newPage();
    const errors = [], external = [], calls = [];
    const failed = new Set(['/api/github/calendar', '/api/leetcode/data/profile', '/api/csdn/stats']);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'coding-weixin-fixture-token'));
    await page.route('https://api.github.com/**', route => { external.push(route.request().url()); return route.abort(); });
    await page.route('https://leetcode.cn/**', route => { external.push(route.request().url()); return route.abort(); });
    await page.route(origin + '/api/**', async route => {
      const url = new URL(route.request().url()), p = url.pathname;
      calls.push(p);
      if (p === '/api/userbinds/list') assert.equal(url.searchParams.get('includeToken'), 'false');
      if (failed.has(p)) return route.fulfill({ json: { code: 113000, message: '模拟第三方请求失败，请重试' } });
      let data = fixtures.dashboardFixture(p);
      if (p === '/api/user/info') data = { id: '1', nickname: '模拟用户', roles: [] };
      if (p === '/api/userbinds/list') data = ['github', 'leetcode', 'csdn'].map(platform => ({ platform, platformUsername: 'fixture' }));
      if (p === '/api/github/calendar') data = { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 8, weeks: [] } } } } };
      if (p === '/api/github/repos') data = [{ id: '9223372036854775806', name: '模拟仓库', full_name: 'fixture/repo', pushed_at: '2026-10-01', stargazers_count: 2 }];
      if (p === '/api/github/repository/contributors') data = [{ login: 'fixture', contributions: 3 }];
      if (p === '/api/github/recent-commits') data = [];
      if (p === '/api/leetcode/data/profile') data = { userProfilePublicProfile: { siteRanking: 7 }, userProfileUserQuestionProgress: { numAcceptedQuestions: [{ difficulty: 'EASY', count: 2 }], numFailedQuestions: [], numUntouchedQuestions: [] } };
      if (p === '/api/leetcode/data/calendar') data = { userCalendar: { submissionCalendar: '{}', streak: 0, totalActiveDays: 0 } };
      if (p === '/api/leetcode/data/contest') data = { userContestRanking: null };
      if (p === '/api/leetcode/data/daily') data = { todayRecord: [] };
      if (p === '/api/leetcode/data/recent') data = { recentACSubmissions: [] };
      if (p === '/api/csdn/stats') data = { viewCount: 123, originalCount: 2, rank: 3, fansCount: 4, likeCount: 5 };
      if (p === '/api/csdn/articles') data = [{ id: '1', title: '模拟文章', postTime: '2026-10-01', viewCount: 2, commentCount: 0 }];
      await route.fulfill({ json: { code: 0, data: data ?? [] } });
    });
    for (const platform of ['github', 'leetcode', 'csdn']) {
      await page.goto(origin + '/#/pages/coding/' + platform);
      await expect(page.getByRole('alert').first()).toContainText('模拟第三方请求失败', { timeout: 30000 }).catch(async error => {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        console.error({ platform, calls, errors, url: page.url(), body: await page.locator('body').innerText() });
        throw error;
      });
      failed.clear();
      await page.getByRole('button', { name: '重试', exact: true }).first().click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (platform === 'github') await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
      if (platform === 'leetcode') await expect(page.locator('.difficulty-row')).toHaveCount(3);
      if (platform === 'csdn') await expect(page.getByText('模拟文章', { exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(output, `${platform}-${width}-${colorScheme}.png`), fullPage: true });
      // 下一页独立验证失败恢复，不让当前页成功状态影响它。
      if (platform === 'github') failed.add('/api/leetcode/data/profile');
      if (platform === 'leetcode') failed.add('/api/csdn/stats');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.ok(calls.includes('/api/github/calendar'));
    assert.ok(calls.includes('/api/leetcode/data/recent'));
    await context.close();
    console.log(`微信编程数据分支与失败重试 ${width}px ${colorScheme}: passed`);
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await writeFile(path.join(output, 'vite.log'), logs);
}
