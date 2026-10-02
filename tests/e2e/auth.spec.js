const { pullDown } = require('./gestures.js');
const { dashboardFixture } = require('./fixtures.js');
const { test, expect } = require('@playwright/test');

const profile = { id: '9223372036854775807', nickname: '生活记录者', email: 'test@example.com', introduction: '认真生活，慢慢记录。' };

async function mockApi(page, options = {}) {
  const requests = { login: 0, info: 0, logout: 0, authorized: false };
  await page.route('http://127.0.0.1:5180/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/login') {
      requests.login++;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return route.fulfill({ json: options.rejectLogin ? { rscode: '113000', result: '用户名或密码错误' } : { rscode: '0', data: { accessToken: 'e2e-token' } } });
    }
    if (path === '/api/user/info') {
      requests.info++;
      requests.authorized = route.request().headers().authorization === 'Bearer e2e-token';
      if (options.expire && requests.info > 1) return route.fulfill({ status: 401, body: '未授权' });
      if (options.failInfo && requests.info === 1) return route.abort();
      return route.fulfill({ json: { rscode: '0', data: profile } });
    }
    if (path === '/api/auth/logout') {
      requests.logout++;
      if (options.failLogout) return route.abort();
      return route.fulfill({ json: { rscode: '0', data: null } });
    }
    const data = dashboardFixture(path);
    if (data !== undefined) return route.fulfill({ json: { rscode: '0', data } });
    return route.fulfill({ status: 404, body: 'Unexpected test request' });
  });
  return requests;
}

async function signIn(page) {
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('test');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

test('空表单不请求，业务错误可见，重复点击不重复提交', async ({ page }) => {
  const requests = await mockApi(page, { rejectLogin: true });
  await page.goto('/');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert').getByText('请输入账号', { exact: true })).toBeVisible();
  expect(requests.login).toBe(0);
  await page.locator('[aria-label="账号"] input').fill('test');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在登录' })).toBeDisabled();
  await expect(page.getByText('用户名或密码错误')).toBeVisible();
  expect(requests.login).toBe(1);
});

test('登录后携带 Bearer，刷新恢复会话，退出后不能访问首页', async ({ page }) => {
  const requests = await mockApi(page);
  await signIn(page);
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  expect(requests.authorized).toBe(true);
  await page.reload();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  expect(requests.login).toBe(1);
  await page.getByText('我', { exact: true }).last().click();
  await expect(page.getByText(profile.nickname)).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  expect(requests.logout).toBe(1);
  await page.goto('/#/pages/home/index');
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
});

test('401 清理会话并返回登录，不循环请求', async ({ page }) => {
  const requests = await mockApi(page, { expire: true });
  await signIn(page);
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
  await pullDown(page, '.dashboard-scroll');
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  expect(requests.info).toBe(2);
  await page.reload();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  expect(requests.info).toBe(2);
});

test('暂时断网保留会话，重试成功，注销断网也清理本机会话', async ({ page }) => {
  const requests = await mockApi(page, { failInfo: true, failLogout: true });
  await signIn(page);
  await expect(page.getByText('连接失败，请检查网络后重试')).toBeVisible();
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  expect(requests.login).toBe(1);
  await page.getByText('我', { exact: true }).last().click();
  await expect(page.getByText(profile.nickname)).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`登录和首页布局 ${width}px ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await mockApi(page);
      await page.goto('/');
      await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
      await expect(page.locator('.login-page')).toHaveCSS('background-color', colorScheme === 'dark' ? 'rgb(17, 18, 21)' : 'rgb(250, 250, 250)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/login-${width}-${colorScheme}.png`, fullPage: true });
      await signIn(page);
      await expect(page.getByRole('button', { name: '刷新GitHub', exact: true })).toBeEnabled();
      await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/home-${width}-${colorScheme}.png`, fullPage: true });
      for (const [label, path] of [['时迹', 'time'], ['我', 'profile']]) {
        await page.locator('uni-tabbar').getByText(label, { exact: true }).click();
        await expect(page).toHaveURL(new RegExp('pages/' + path + '/index'));
        await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', colorScheme === 'dark' ? 'rgb(17, 18, 21)' : 'rgb(240, 242, 245)');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/${path}-${width}-${colorScheme}.png`, fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
}
