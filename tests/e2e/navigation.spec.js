const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

test('四栏切换、日期查询、退出清理与重新登录', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dates = [];
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'navigation-fixture' };
    if (path === '/api/user/info') data = { id: '1', username: 'fixture', nickname: '导航测试用户', email: 'fixture@example.com' };
    if (path === '/api/auth/logout') data = null;
    if (path === '/api/quick-nav/candidates') data = [];
    if (path === '/api/menu/preferences') data = { menus: [], hiddenMenuIds: [] };
    if (path === '/api/timeRecord/query') {
      dates.push(url.searchParams.get('date'));
      const records = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), categoryId: '1', startTime: i * 60, endTime: i * 60 + 29 }));
      data = { items: url.searchParams.get('page') === '2' ? records.slice(4) : records.slice(0, 4), total: 8 };
    }
    await route.fulfill({ json: { rscode: '0', data } });
  });
  async function login() {
    await page.locator('[aria-label="账号"] input').fill('fixture');
    await page.locator('[aria-label="密码"] input').fill('fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
  }
  await page.goto('/');
  await expect(page.locator('uni-tabbar')).toBeHidden();
  await login();
  await expect(page.locator('uni-tabbar').getByText('首页', { exact: true })).toBeVisible();
  const homeIcon = page.locator('uni-tabbar .uni-tabbar__item').first().locator('img');
  await expect(homeIcon).toHaveAttribute('src', /home-house-active\.png(?:\?.*)?$/);
  await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
  await expect(page).toHaveURL(/pages\/time\/index/);
  await expect(homeIcon).toHaveAttribute('src', /home-house\.png(?:\?.*)?$/);
  await expect(page.locator('.timeline-event')).toHaveCount(8);
  const today = await page.locator('.date-value').innerText();
  const initialRequestCount = dates.length;
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(page.locator('.date-value')).not.toHaveText(today);
  await expect.poll(() => dates.length).toBeGreaterThan(initialRequestCount);
  const selected = await page.locator('.date-value').innerText();
  expect(dates.slice(initialRequestCount)).toContain(selected);
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.locator('.date-value')).toHaveText(today);
  await expect.poll(() => dates.slice(initialRequestCount).includes(today)).toBe(true);
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await expect(page.getByText('暂无可用功能', { exact: true })).toBeVisible();
  await expect(homeIcon).toHaveAttribute('src', /home-house\.png(?:\?.*)?$/);
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await expect(homeIcon).toHaveAttribute('src', /home-house\.png(?:\?.*)?$/);
  await expect(page.getByText('导航测试用户', { exact: true })).toBeVisible();
  await expect(page.getByText('fixture@example.com')).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('退出当前账号？')).toBeHidden();
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await expect(homeIcon).toHaveAttribute('src', /home-house-active\.png(?:\?.*)?$/);
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await expect(page.locator('uni-tabbar')).toBeHidden();
  await login();
  await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
});
