const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
async function setup(page, override) {
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (override && await override(route, path)) return;
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'dashboard-fixture' };
    if (path === '/api/user/info') data = { id: '1', nickname: '测试用户' };
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('test');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
}
test('统计卡和内容卡独立失败、重试恢复，隐藏闪念不暴露原文', async ({ page }) => {
  let cards = 0, thoughts = 0;
  await setup(page, async (route, path) => {
    if ((path === '/api/dashboard/card/GITHUB' && ++cards === 1) || (path === '/api/thought/dashboard' && ++thoughts === 1)) {
      await route.fulfill({ status: 503, body: 'unavailable' }); return true;
    }
  });
  await expect(page.getByText('1h30m')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试GitHub', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试GitHub', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试闪念' }).click();
  await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
  await expect(page.getByText('内容已隐藏')).toBeVisible();
  await expect(page.getByText('PRIVATE HIDDEN CONTENT')).toHaveCount(0);
  expect(cards).toBe(2); expect(thoughts).toBe(2);
});
test('首页并行接口的 401 清理登录态，只跳转一次', async ({ page }) => {
  await setup(page, async (route, path) => {
    if (path === '/api/dashboard/card/GITHUB' || path === '/api/thought/dashboard') {
      await route.fulfill({ status: 401, body: '未授权' }); return true;
    }
  });
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
});
test('空账号不伪造统计和记录，不请求未绑定 GitHub，手机可滚动到页面底部', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let github = 0;
  await setup(page, async (route, path) => {
    if (path === '/api/github/recent-commits') github++;
    const empty = { '/api/dashboard/tasks': [], '/api/quick-nav/my': [], '/api/thought/dashboard': [], '/api/taskDetails/watched': [], '/api/exerciseRecord/dashboardSummary': { days: [] }, '/api/timeRecord/query': { items: [] } };
    if (path in empty) { await route.fulfill({ json: { rscode: '0', data: empty[path] } }); return true; }
  });
  await expect(page.getByText('今日暂无记录')).toBeVisible();
  await expect(page.getByText('暂无快捷方式')).toBeVisible();
  await page.getByText('闪念', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('暂无固定的闪念')).toBeVisible();
  await expect(page.getByText('最近提交', { exact: true })).toHaveCount(0);
  await expect(page.getByText('运动', { exact: true })).toHaveCount(0);
  expect(github).toBe(0);
});
test('运动分页失败保留已有记录，重试使用同一游标', async ({ page }) => {
  let next = 0;
  await setup(page, async (route, path) => {
    if (path !== '/api/exerciseRecord/dashboardSummary') return false;
    const cursor = new URL(route.request().url()).searchParams.get('lastDate');
    if (cursor) {
      expect(cursor).toBe('2026-09-28');
      if (++next === 1) { await route.abort(); return true; }
      await route.fulfill({ json: { rscode: '0', data: { days: [{ date: '2026-09-27', items: [{ exerciseTypeId: '2', typeLabel: '骑行', count: 15 }] }], hasMore: false } } }); return true;
    }
    await route.fulfill({ json: { rscode: '0', data: { ...dashboardFixture(path), hasMore: true, lastDate: '2026-09-28' } } }); return true;
  });
  await page.getByRole('button', { name: '加载更多运动' }).click();
  await expect(page.getByText('跑步 5', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: '加载失败，重试更多运动' }).click();
  await expect(page.getByText('骑行 15')).toBeAttached();
  expect(next).toBe(2);
});
