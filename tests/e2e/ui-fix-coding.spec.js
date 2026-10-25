const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

const days = Array.from({ length: 365 }, (_, i) => ({ date: new Date(Date.UTC(2025, 10, 1 + i)).toISOString().slice(0, 10), contributionCount: i % 9 }));
const repos = Array.from({ length: 35 }, (_, i) => ({ id: String(i), name: `fixture-repo-${i}`, full_name: `fixture/repo-${i}`, html_url: 'https://example.com', description: '模拟仓库说明', stargazers_count: i, forks_count: 0, pushed_at: '2026-10-20' }));

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`编程菜单热力图与列表 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), theme);
    await page.route('https://api.github.com/**', async route => {
      const url = route.request().url();
      const data = url.includes('/graphql') ? { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 1000, weeks: [{ contributionDays: days }] } } } } } : url.includes('/contributors') ? [] : repos;
      await route.fulfill({ json: data });
    });
    await page.route('**/leetcode-api/graphql**', async route => {
      const query = route.request().postDataJSON().query;
      let data = {};
      if (query.includes('userProfilePublicProfile')) data = { userProfilePublicProfile: { siteRanking: 100, profile: { reputation: 8 } }, userProfileUserQuestionProgress: {} };
      else if (query.includes('userCalendar')) data = { userCalendar: { submissionCalendar: JSON.stringify({ [Math.floor(Date.now() / 1000)]: 8 }), totalActiveDays: 1 } };
      else if (query.includes('todayRecord')) data = { todayRecord: [] };
      else if (query.includes('recentACSubmissions')) data = { recentACSubmissions: [] };
      await route.fulfill({ json: { data } });
    });
    await page.route(`${testInfo.project.use.baseURL}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      let data = dashboardFixture(path);
      if (path === '/api/auth/login') data = { accessToken: 'coding-ui-fixture' };
      if (path === '/api/user/info') data = { id: '7', nickname: '模拟用户', accountUsername: 'fixture' };
      if (path === '/api/userbinds/list') data = ['github', 'leetcode', 'csdn'].map(platform => ({ platform, platformUsername: 'fixture' }));
      if (path === '/api/github/recent-commits') data = [{ id: '1', repo: 'fixture', message: '模拟最近提交', actor: 'fixture', date: '2026-10-20T10:30:00.000+08:00' }];
      if (path === '/api/csdn/stats') data = { viewCount: 1234567, originalCount: 1200, rank: 1234, fansCount: 2000, likeCount: 3000, commentCount: 4000 };
      if (path === '/api/csdn/articles') data = [{ id: '1', title: '模拟长摘要文章', description: '这是一篇用于检查摘要展开和收起的模拟文章。'.repeat(40), postTime: '2026-10-20', viewCount: 123456, commentCount: 2, url: 'https://example.com' }];
      await route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } });
    });
    await page.goto('/');
    await page.locator('[aria-label="账号"] input').fill('fixture');
    await page.locator('[aria-label="密码"] input').fill('fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    await page.goto('/#/pages/coding/github');
    await expect(page.locator('.month-label').filter({ hasText: '月' }).first()).toBeVisible();
    expect(await page.locator('.month-label').filter({ hasText: '月' }).first().evaluate(label => ({
      width: label.getBoundingClientRect().width,
      parentWidth: label.parentElement.getBoundingClientRect().width,
      clips: label.scrollWidth > label.clientWidth,
    }))).toMatchObject({ width: 40, clips: false });
    await expect(page.locator('.calendar-week .level-1').first()).toBeAttached();
    await expect(page.locator('.calendar-week .level-4').first()).toBeAttached();
    await page.getByRole('button', { name: '最近提交', exact: true }).click();
    await expect(page.getByText('模拟最近提交', { exact: true })).toBeVisible();
    await expect(page.getByText('2026-10-20T10:30:00.000+08:00')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('github-commits.png'), fullPage: true });
    await page.getByRole('button', { name: '仓库', exact: true }).click();
    await expect(page.getByText('fixture-repo-34', { exact: true })).toBeAttached();
    await page.goto('/#/pages/coding/csdn');
    await expect(page.getByText('1,234,567', { exact: true })).toBeVisible();
    const summary = page.locator('.record-description');
    await expect(summary).toHaveClass(/description-collapsed/);
    await page.screenshot({ path: testInfo.outputPath('csdn-collapsed.png'), fullPage: true });
    await page.getByRole('button', { name: '展开摘要', exact: true }).click();
    await expect(summary).not.toHaveClass(/description-collapsed/);
    await page.getByRole('button', { name: '收起摘要', exact: true }).click();
    await expect(summary).toHaveClass(/description-collapsed/);
    await page.goto('/#/pages/coding/leetcode');
    await expect(page.locator('.month-label').filter({ hasText: '月' }).first()).toBeVisible();
    expect(await page.locator('.month-label').filter({ hasText: '月' }).first().evaluate(label => ({
      width: label.getBoundingClientRect().width,
      parentWidth: label.parentElement.getBoundingClientRect().width,
      clips: label.scrollWidth > label.clientWidth,
    }))).toMatchObject({ width: 40, clips: false });
    await page.locator('.calendar-surface').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('leetcode-calendar.png'), fullPage: true });
  });
}
