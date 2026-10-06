const { test, expect } = require('@playwright/test');
const { pullDown } = require('./gestures');

async function fixtures(page) {
  const calls = {};
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-page-refresh' })));
  async function route(path, response) {
    const handler = async route => {
      calls[path] = (calls[path] || 0) + 1;
      const data = typeof response === 'function' ? response(new URL(route.request().url())) : response;
      await route.fulfill({ json: { code: 0, data } });
    };
    await page.route('**/api' + path, handler);
    await page.route('**/api' + path + '?*', handler);
  }
  await route('/auth/secondary-lock/menus', []);
  await route('/user/info', { id: 'fixture-user', nickname: '模拟用户', roles: [] });
  await route('/timeTrackerCategory/list', []);
  await route('/timeRecord/query', []);
  await route('/menu/visuals', { menus: [], cards: {} });
  await route('/userDictType/getByDictType', { dictDetailList: [{ id: 'type', dictLabel: '模拟分类' }] });
  await route('/goals', [{ id: '1', title: '模拟目标', type: 1, status: 'in_progress', isPinned: 0 }]);
  const books = Array.from({ length: 35 }, (_, i) => ({ id: String(i + 1), title: '模拟阅读 ' + (i + 1), status: 'in_progress', type: 1 }));
  await route('/read-record/page', url => {
    const current = Number(url.searchParams.get('current') || 1);
    return { items: books.slice((current - 1) * 30, current * 30), total: books.length };
  });
  await route('/expense/query', { items: [{ id: '1', amt: 12, expDesc: '模拟支出', expTime: '2026-10-05 12:00:00', expTypeId: 'type', payTypeId: 'type' }], total: 1 });
  await route('/expense/statisticsByMonth', []);
  return { calls, errors };
}
async function visibility(page, value) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
for (const width of [390, 820]) {
  test(`时迹页空态返回浏览器不重新查询 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { calls, errors } = await fixtures(page);
    await page.goto('/#/pages/time/index');
    await expect.poll(() => calls['/timeRecord/query'] || 0).toBeGreaterThan(0);
    await expect(page.getByText('加载失败，请重试', { exact: true })).toHaveCount(0);
    await page.waitForTimeout(100);
    const counts = { ...calls };
    for (let i = 0; i < 3; i++) { await visibility(page, 'hidden'); await visibility(page, 'visible'); }
    await page.waitForTimeout(100);
    expect(calls).toEqual(counts);
    expect(errors).toEqual([]);
  });
  test(`目标页返回浏览器不刷新；59 分钟保留，60 分钟自动更新 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const start = new Date('2026-10-05T04:00:00Z');
    await page.clock.install({ time: start });
    const { calls, errors } = await fixtures(page);
    await page.goto('/#/pages/tasks/goals');
    await expect(page.locator('.goal-grid')).toContainText('模拟目标');
    await expect(page.getByText('正在更新内容', { exact: true })).toHaveCount(0);
    const before = await page.locator('.goal-grid').boundingBox();
    const count = calls['/goals'];
    for (let i = 0; i < 3; i++) { await visibility(page, 'hidden'); await visibility(page, 'visible'); }
    await page.waitForTimeout(100);
    expect(calls['/goals']).toBe(count);
    expect(await page.locator('.goal-grid').boundingBox()).toEqual(before);
    await visibility(page, 'hidden');
    await page.clock.setFixedTime(new Date(start.getTime() + 59 * 60 * 1000));
    await visibility(page, 'visible'); await page.waitForTimeout(100);
    expect(calls['/goals']).toBe(count);
    await visibility(page, 'hidden');
    await page.clock.setFixedTime(new Date(start.getTime() + 60 * 60 * 1000 + 1000));
    await visibility(page, 'visible');
    await expect.poll(() => calls['/goals']).toBe(count + 1);
    await page.getByRole('button', { name: '搜索目标', exact: true }).click();
    await expect.poll(() => calls['/goals']).toBe(count + 2);
    expect(errors).toEqual([]);
  });
  test(`阅读分页返回浏览器保留，手动下拉仍重新加载 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { calls, errors } = await fixtures(page);
    await page.goto('/#/pages/records/library?kind=read');
    await expect(page.locator('.library-grid .library-card')).toHaveCount(30);
    const scroll = page.locator('.mobile-page-scroll .uni-scroll-view').last();
    await expect.poll(() => page.evaluate(() => performance.now())).toBeGreaterThan(250);
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('.library-grid .library-card')).toHaveCount(35);
    const count = calls['/read-record/page'];
    await visibility(page, 'hidden'); await visibility(page, 'visible');
    await page.waitForTimeout(100);
    expect(calls['/read-record/page']).toBe(count);
    await expect(page.locator('.library-grid .library-card')).toHaveCount(35);
    await scroll.evaluate(el => { el.scrollTop = 0; });
    await pullDown(page, '.mobile-page-scroll');
    await expect.poll(() => calls['/read-record/page']).toBe(count + 1);
    await expect(page.locator('.library-grid .library-card')).toHaveCount(30);
    expect(errors).toEqual([]);
  });
  test(`财务页面返回浏览器保留组件，不重新请求列表与统计 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { calls, errors } = await fixtures(page);
    await page.goto('/#/pages/finance/expense');
    await expect(page.locator('.ledger-row')).toContainText('模拟支出');
    const counts = { ...calls };
    for (let i = 0; i < 3; i++) { await visibility(page, 'hidden'); await visibility(page, 'visible'); }
    await page.waitForTimeout(100);
    expect(calls).toEqual(counts);
    await expect(page.locator('.ledger-row')).toContainText('模拟支出');
    expect(errors).toEqual([]);
  });
}
