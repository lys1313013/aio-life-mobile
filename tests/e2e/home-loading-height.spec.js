const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');
const { pullDown } = require('./gestures');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function setup(page) {
  const state = { pending: gate(), failLinks: false, empty: false, profiles: 0 };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'height-fixture'));
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/user/info') {
      state.profiles++;
      return route.fulfill({ json: { rscode: '0', data: { id: '1', nickname: '模拟用户' } } });
    }
    // 导航权限检查先完成；延迟门只控制本用例要测量的卡片请求。
    if (path === '/api/auth/secondary-lock/menus') return route.fulfill({ json: { rscode: '0', data: [] } });
    // 概览先完成，让绑定的 GitHub 卡片也进入 loading 后再测量。
    if (path !== '/api/dashboard/tasks' && !path.startsWith('/api/dashboard/card/')) await state.pending.promise;
    if (path === '/api/quick-nav/my' && state.failLinks) return route.fulfill({ json: { rscode: '1', result: '模拟加载失败' } });
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/taskDetails/watched') data = [{ id: '1', content: '模拟待办：整理本周记录', taskName: '生活计划', isCompleted: 0 }];
    if (state.empty && ['/api/quick-nav/my', '/api/thought/dashboard'].includes(path)) data = [];
    await route.fulfill({ json: { rscode: '0', data } });
  });
  return state;
}

function card(page, title) {
  return page.locator('.dashboard-section').filter({ has: page.locator('.section-title').getByText(title, { exact: true }) });
}

async function heights(page) {
  return page.locator('.dashboard-section').evaluateAll(elements => Object.fromEntries(elements.map(element => [
    element.querySelector('.section-title').textContent,
    element.getBoundingClientRect().height,
  ])));
}

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const width of [360, 390, 700, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`home card heights stay stable ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/home/index');
    await expect(page.locator('.section-loading')).toHaveCount(6);
    const before = await heights(page);
    await page.screenshot({ path: info.outputPath('loading.png'), fullPage: true });
    state.pending.release();
    await expect(page.locator('.section-loading')).toHaveCount(0);
    await expect(page.locator('.task-row')).toHaveCount(1);
    expect(await heights(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('loaded.png'), fullPage: true });

    state.pending = gate();
    const profiles = state.profiles;
    await pullDown(page, '.dashboard-scroll');
    await expect.poll(() => state.profiles).toBeGreaterThan(profiles);
    expect(await heights(page)).toEqual(before);
    await expect(page.locator('.task-row')).toHaveCount(1);
    state.pending.release();
  });
}

test('home card height survives error, retry and empty content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const state = await setup(page);
  state.failLinks = true;
  state.empty = true;
  await page.goto('/#/pages/home/index');
  await expect(page.locator('.section-loading')).toHaveCount(6);
  const before = await heights(page);
  state.pending.release();
  await expect(page.getByRole('button', { name: '重试快捷导航' })).toBeVisible();
  expect(await heights(page)).toEqual(before);
  state.failLinks = false;
  state.pending = gate();
  await page.getByRole('button', { name: '重试快捷导航' }).click();
  await expect(card(page, '快捷导航').locator('.section-loading')).toBeVisible();
  expect(await heights(page)).toEqual(before);
  state.pending.release();
  await expect(page.getByText('暂无快捷方式', { exact: true })).toBeVisible();
  expect(await heights(page)).toEqual(before);
});
