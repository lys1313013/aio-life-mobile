const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const lockedId = '9223372036854775807';
async function setup(page, initial = {}) {
  const state = { verified: [], reads: 0, checks: 0, trees: 0, ids: [lockedId], failCheck: false, delayCheck: null, requireUnlock: false, unlocked: false, ...initial };
  await page.route(/http:\/\/127\.0\.0\.1:\d+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/auth/login') data = { accessToken: 'unlock-fixture' };
    if (path === '/api/user/info') data = { id: 'fixture', nickname: '菜单锁测试' };
    if (path === '/api/quick-nav/candidates') data = [{ menuId: 'memo', path: '/my-hub/memo', title: '笔记' }];
    if (path === '/api/menu/preferences') data = { menus: [{ id: 'memo', title: '笔记', children: [] }], hiddenMenuIds: [] };
    if (path === '/api/auth/secondary-lock/menus') {
      state.checks++;
      if (state.delayCheck) await state.delayCheck;
      if (state.failCheck) return route.fulfill({ json: { code: 1, message: '菜单锁检查失败' } });
      data = state.ids;
    }
    if (path === '/api/menu/all') { state.trees++; data = [{ path: '/my-hub', meta: { menuId: lockedId }, children: [{ path: '/my-hub/memo', meta: { menuId: 'memo' } }] }]; }
    if (path === '/api/auth/secondary-verify') {
      const body = route.request().postDataJSON();
      state.verified.push(body);
      if (body.password !== 'correct-fixture') return route.fulfill({ json: { code: 1, message: '二级密码错误' } });
      state.unlocked = true;
      data = { menuPath: body.menuPath };
    }
    if (path.startsWith('/api/memo/')) {
      state.reads++;
      if (state.requireUnlock && !state.unlocked) return route.fulfill({ json: { code: 2001, message: '需要二级密码验证', data: { menuPath: '/my-hub/memo' } } });
      data = { items: [], total: 0 };
    }
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await expect(page.getByRole('button', { name: '笔记', exact: true })).toBeVisible();
  return state;
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`跳转前验证、取消、错误恢复与密码眼睛 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await expect.poll(() => state.trees).toBe(1);
    expect(state.checks).toBe(1);
    await expect(page.locator('uni-loading')).toHaveCount(0);
    const entry = page.getByRole('button', { name: '笔记', exact: true });
    const modal = page.getByRole('dialog', { name: '解锁菜单', exact: true });
    await entry.click();
    await expect(modal).toBeVisible();
    await expect(page).toHaveURL(/pages\/life\/index/);
    expect(state.reads).toBe(0);
    const input = modal.locator('input');
    await input.fill('wrong-fixture');
    await expect(input).toHaveAttribute('type', 'password');
    await modal.getByRole('button', { name: '显示密码', exact: true }).click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue('wrong-fixture');
    await modal.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('二级密码错误');
    await expect(page).toHaveURL(/pages\/life\/index/);
    expect(state.reads).toBe(0);
    await modal.getByRole('button', { name: '取消', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(/pages\/life\/index/);
    await entry.click();
    await expect(modal).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('type', 'password');
    await modal.screenshot({ path: `artifacts/secondary-unlock-guard/${width}-${theme}.png` });
    await page.screenshot({ path: `artifacts/secondary-unlock-guard/${width}-${theme}-page.png` });
    await input.fill('correct-fixture');
    await modal.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(page).toHaveURL(/pages\/records\/notes\?kind=memo/);
    await expect(modal).toHaveCount(0);
    expect(state.verified.at(-1)).toEqual({ password: 'correct-fixture', menuPath: '/my-hub/memo' });
    await expect.poll(() => state.reads).toBeGreaterThan(0);
    await page.locator('[aria-label="返回"]').click();
    await entry.click();
    await expect(page).toHaveURL(/pages\/records\/notes\?kind=memo/);
    expect(state.verified).toHaveLength(2);
    expect(state.checks).toBe(1);
    expect(state.trees).toBe(1);
    await expect(page.getByText('检查菜单锁', { exact: true })).toHaveCount(0);
  });
}
test('我的入口不重复请求菜单锁，检查服务失败也可进入个人中心', async ({ page }) => {
  const state = await setup(page);
  state.failCheck = true;
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await expect(page).toHaveURL(/pages\/profile\/index/);
  await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
  expect(state.checks).toBe(1);
  expect(state.trees).toBe(1);
  await expect(page.getByText('检查菜单锁', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '解锁菜单', exact: true })).toHaveCount(0);
});

test('预取失败可进入首页，点击重试失败不进入菜单，迟到检查不能覆盖新导航', async ({ page }) => {
  const state = await setup(page, { failCheck: true });
  // 首屏预取失败后，进入全部页会重试一次；成功缓存场景不重复检查。
  await expect.poll(() => state.checks).toBe(2);
  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await expect(page.getByText('菜单锁检查失败', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/pages\/life\/index/);
  expect(state.reads).toBe(0);
  state.failCheck = false;
  let release;
  state.delayCheck = new Promise((resolve) => { release = resolve; });
  try {
    await page.getByRole('button', { name: '笔记', exact: true }).click();
    await expect(page.locator('.page-navigation [role="status"]')).toBeVisible();
    await expect(page.locator('uni-loading')).toHaveCount(0);
    await expect(page.getByText('检查菜单锁', { exact: true })).toHaveCount(0);
    await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/auth/secondary-lock/menus');
    release();
    await response;
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    await expect(page.getByRole('dialog', { name: '解锁菜单', exact: true })).toHaveCount(0);
    expect(state.reads).toBe(0);
  } finally {
    release();
  }
});

test('无锁结果缓存，重复进入不再检查；服务端2001仍触发解锁并使缓存失效', async ({ page }) => {
  const state = await setup(page, { ids: [] });
  const entry = page.getByRole('button', { name: '笔记', exact: true });
  await entry.click();
  await expect(page).toHaveURL(/pages\/records\/notes/);
  await expect.poll(() => state.reads).toBeGreaterThan(0);
  await page.locator('[aria-label="返回"]').click();
  state.ids = [lockedId];
  state.requireUnlock = true;
  await entry.click();
  const modal = page.getByRole('dialog', { name: '解锁菜单', exact: true });
  await expect(modal).toBeVisible();
  expect(state.checks).toBe(1);
  expect(state.trees).toBe(0);
  await modal.locator('input').fill('correct-fixture');
  await modal.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.locator('[aria-label="返回"]').click();
  await entry.click();
  await expect(page).toHaveURL(/pages\/records\/notes/);
  expect(state.checks).toBe(2);
  expect(state.trees).toBe(1);
});

test('冷启动慢检查复用预取请求，无全局遮罩且解锁前不读取业务数据', async ({ page }) => {
  let release;
  const delayCheck = new Promise((resolve) => { release = resolve; });
  const state = await setup(page, { delayCheck });
  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await expect(page.locator('.page-navigation [role="status"]')).toBeVisible();
  await expect(page.locator('uni-loading')).toHaveCount(0);
  await expect(page.getByText('检查菜单锁', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/pages\/life\/index/);
  expect(state.checks).toBe(1);
  expect(state.reads).toBe(0);
  for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('.page-navigation [role="status"]')).toBeVisible();
    await page.screenshot({ path: `artifacts/secondary-unlock-guard/check-${width}-${theme}.png` });
  }
  release();
  await expect(page.getByRole('dialog', { name: '解锁菜单', exact: true })).toBeVisible();
  await expect(page.locator('.page-navigation [role="status"]')).toHaveCount(0);
  expect(state.reads).toBe(0);
});
