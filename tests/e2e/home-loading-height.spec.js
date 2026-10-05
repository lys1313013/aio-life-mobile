const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');
const { pullDown } = require('./gestures');
const pendingRequests = new WeakMap();

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function setup(page) {
  const state = { pending: gate(), failLinks: false, empty: false, profiles: 0, watched: [{ id: '1', content: '模拟待办：整理本周记录', taskName: '生活计划', isCompleted: 0 }] };
  pendingRequests.set(page, state);
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'height-fixture'));
  await page.route(`${test.info().project.use.baseURL}/api/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/user/info') {
      state.profiles++;
      return route.fulfill({ json: { rscode: '0', data: { id: '1', nickname: '模拟用户' } } });
    }
    // 导航权限检查先完成；延迟门只控制本用例要测量的卡片请求。
    if (path === '/api/auth/secondary-lock/menus') return route.fulfill({ json: { rscode: '0', data: [] } });
    // 概览先完成，让绑定的 GitHub 卡片也进入 loading 后再测量。
    if (path !== '/api/home/cards' && path !== '/api/dashboard/tasks' && !path.startsWith('/api/dashboard/card/')) await state.pending.promise;
    if (path === '/api/quick-nav/my' && state.failLinks) return route.fulfill({ json: { rscode: '1', result: '模拟加载失败' } });
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/taskDetails/watched') data = state.watched;
    if (state.empty && ['/api/quick-nav/my', '/api/thought/dashboard'].includes(path)) data = [];
    await route.fulfill({ json: { rscode: '0', data } });
  });
  return state;
}

function card(page, title) {
  return page.locator('.dashboard-section').filter({ has: page.locator('.section-title').getByText(title, { exact: true }) });
}

function expectLoadedHeights(before, after, width) {
  const { 待办: beforeTask, ...beforeOther } = before;
  const { 待办: afterTask, ...afterOther } = after;
  expect(afterOther).toEqual(beforeOther);
  if (width < 768) {
    expect(afterTask).toBeGreaterThan(100);
    expect(afterTask).toBeLessThan(160);
    expect(afterTask).toBe(beforeTask);
  } else {
    expect(afterTask).toBe(beforeTask);
  }
}

async function heights(page) {
  return page.locator('.dashboard-section').evaluateAll(elements => Object.fromEntries(elements.map(element => [
    element.querySelector('.section-title').textContent,
    element.getBoundingClientRect().height,
  ])));
}

test.afterEach(async ({ page }) => {
  pendingRequests.get(page)?.pending.release();
  await page.unrouteAll({ behavior: 'wait' });
});

for (const width of [360, 390, 700, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`home cards size to content and stay stable on refresh ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/home/index');
    await expect(page.locator('.dashboard-section').getByRole('status', { name: /^正在加载/ })).toHaveCount(6);
    const before = await heights(page);
    await page.screenshot({ path: info.outputPath('loading.png'), fullPage: true });
    state.pending.release();
    await expect(page.locator('.dashboard-section').getByRole('status', { name: /^正在加载/ })).toHaveCount(0);
    await expect(page.locator('.task-row')).toHaveCount(1);
    const loaded = await heights(page);
    expectLoadedHeights(before, loaded, width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('loaded.png'), fullPage: true });

    state.pending = gate();
    const profiles = state.profiles;
    await pullDown(page, '.dashboard-scroll');
    await expect.poll(() => state.profiles).toBeGreaterThan(profiles);
    expect(await heights(page)).toEqual(loaded);
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
  await expect(page.locator('.dashboard-section').getByRole('status', { name: /^正在加载/ })).toHaveCount(6);
  const before = await heights(page);
  state.pending.release();
  await expect(page.getByRole('button', { name: '重试快捷导航' })).toBeVisible();
  const loaded = await heights(page);
  expectLoadedHeights(before, loaded, 390);
  state.failLinks = false;
  state.pending = gate();
  await page.getByRole('button', { name: '重试快捷导航' }).click();
  await expect(card(page, '快捷导航').locator('.section-loading')).toBeVisible();
  expect(await heights(page)).toEqual(loaded);
  state.pending.release();
  await expect(page.getByText('暂无快捷方式', { exact: true })).toBeVisible();
  expect(await heights(page)).toEqual(loaded);
});

test('single-column watched tasks cap height and keep long content scrollable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const state = await setup(page);
  state.watched = Array.from({ length: 8 }, (_, index) => ({ id: String(index + 1), content: `模拟待办 ${index + 1}：整理本周记录并补充需要跟进的项目内容和验收说明`, taskName: '生活计划', isCompleted: 0 }));
  state.pending.release();
  await page.goto('/#/pages/home/index');
  await expect(page.locator('.task-row')).toHaveCount(8);
  const tasks = card(page, '待办');
  expect((await tasks.boundingBox()).height).toBeLessThanOrEqual(242);
  await tasks.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('many-tasks.png'), fullPage: true });
  const scroll = tasks.locator('.uni-scroll-view-scrollbar-hidden');
  await scroll.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`过期返回首页后台刷新保留内容和高度 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const start = new Date('2026-10-05T04:00:00Z');
    await page.clock.install({ time: start });
    const state = await setup(page);
    state.pending.release();
    await page.goto('/#/pages/home/index');
    await expect(page.locator('.task-row')).toHaveCount(1);
    await expect(page.locator('.dashboard-section').getByRole('status', { name: /^正在加载/ })).toHaveCount(0);
    await expect(page.locator('.overview-card .card-progress')).toHaveCount(0);
    const before = await heights(page);
    const values = await page.locator('.stat-value').allTextContents();
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.getByRole('button', { name: '关于', exact: true }).click();
    await expect(page).toHaveURL(/pages\/about\/index/);
    state.pending = gate();
    await page.clock.setFixedTime(new Date(start.getTime() + 60 * 60 * 1000 + 1000));
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
    await expect(page.getByRole('status', { name: '正在更新快捷导航' })).toBeVisible();
    await expect(page.locator('.dashboard-section .content-skeleton')).toHaveCount(0);
    await expect(page.locator('.task-row')).toHaveCount(1);
    expect(await heights(page)).toEqual(before);
    expect(await page.locator('.stat-value').allTextContents()).toEqual(values);
    await page.screenshot({ path: info.outputPath('background.png'), fullPage: true });
    state.failLinks = true;
    state.pending.release();
    await expect(page.getByRole('button', { name: /^重试快捷导航：/ })).toBeVisible();
    await expect(page.locator('.quick-link')).toHaveCount(2);
    expect(await heights(page)).toEqual(before);
  });
}
