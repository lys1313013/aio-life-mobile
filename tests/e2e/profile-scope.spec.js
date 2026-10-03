const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

async function setup(page) {
  const state = { writes: [], wait: null, pendingReads: 0 };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'account-a'));
  await page.route(new URL('/api/**', test.info().project.use.baseURL).href, async route => {
    const path = new URL(route.request().url()).pathname;
    const account = route.request().headers().authorization?.includes('account-b') ? 'B' : 'A';
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'account-b' };
    if (path === '/api/user/info') {
      if (state.wait) { state.pendingReads++; await state.wait; }
      data = { id: account, accountUsername: account, nickname: '用户' + account, introduction: account + '简介', email: account + '@example.com', roles: [] };
    }
    if (path === '/api/users' && route.request().method() === 'PUT') {
      state.writes.push({ account, body: route.request().postDataJSON() });
      data = true;
    }
    await route.fulfill({ json: { rscode: '0', data: data ?? [] } });
  });
  await page.goto('/#/pages/profile/settings');
  await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('用户A');
  return state;
}

// 从真实登录入口切换账号，不依赖开发服务器导出的源码模块。
async function signInAsB(page) {
  await page.goto('/#/pages/profile/index');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.locator('[aria-label="账号"] input').fill('account-b');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await page.getByRole('button', { name: '基本设置', exact: true }).click();
  await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('用户B');
}

test('资料页切账号清空旧表单并保存当前账号数据', async ({ page }) => {
  const state = await setup(page);
  await page.locator('[aria-label="昵称"] input').fill('A未保存');
  await signInAsB(page);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toEqual({ account: 'B', body: { nickname: '用户B', introduction: 'B简介', avatarFileId: null } });
});

test('资料页离页旧加载不能覆盖返回后的当前加载', async ({ page }) => {
  const state = await setup(page);
  let release;
  state.wait = new Promise(resolve => { release = resolve; });
  await page.goto('/#/pages/profile/security');
  await expect(page.getByText('菜单锁', { exact: true })).toBeVisible();
  await page.goBack();
  await expect.poll(() => state.pendingReads).toBe(1);
  await expect(page.locator('.settings-card')).toHaveCount(0);
  state.wait = null;
  await signInAsB(page);
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/user/info') && response.request().headers().authorization?.includes('account-a'));
  release();
  await oldResponse;
  await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('用户B');
  expect(state.writes).toEqual([]);
});
