const { test, expect } = require('@playwright/test');
const { calendarFixture } = require('./fixtures-finance-calendar');
const fs = require('node:fs');
const path = require('node:path');
const routes = ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'];
async function setup(page, { theme = 'light', delay = 0, empty = false, fail = false, locked = false } = {}) {
  const calls = []; const state = { fail };
  await page.addInitScript(theme => {
    localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'finance-fixture-token' }));
    localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
  }, theme);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), pathname = url.pathname.replace('/api', ''); calls.push(pathname);
    let data = [];
    if (pathname === '/user/info') data = { id: 'finance-fixture', nickname: '模拟用户' };
    if (pathname === '/menu/all') data = routes.map((path, index) => ({ path, meta: { menuId: index === 2 ? 'expense-lock' : 'finance-' + index } }));
    if (pathname === '/quick-nav/candidates') data = routes.map(path => ({ path }));
    if (pathname === '/auth/secondary-lock/menus') data = locked ? ['expense-lock'] : [];
    if (pathname === '/menu/visuals') data = { menus: [], cards: {} };
    if (pathname.endsWith('/calendar')) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟概览失败' } });
      data = calendarFixture(url, 'finance', empty ? 0 : 3);
    }
    if (pathname.endsWith('/getByDictType')) data = { dictDetailList: [] };
    if (pathname.endsWith('/query')) data = { items: [], total: 0 };
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/finance/index'); return { calls, state };
}
for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`财务概览日历 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const fixture = await setup(page, { theme, delay: 400 });
    const card = page.locator('[aria-label="收支概览首页卡片"]');
    await expect(card.getByRole('status', { name: '正在加载收支概览' })).toBeVisible(); const pending = await card.boundingBox();
    await expect(card).toHaveAttribute('aria-busy', 'false'); expect((await card.boundingBox()).height).toBe(pending.height);
    await expect(card.getByRole('button', { name: '查看结余', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText('12,345.67'); await expect(card).toContainText('2,345.67'); await expect(card).toContainText('10,000.00');
    await card.getByRole('button', { name: '查看收入', exact: true }).click(); await expect(card.locator('.calendar-amount').first()).toHaveText('12,345.67');
    await card.getByRole('button', { name: '收支概览：月', exact: true }).click(); await expect(card).toHaveAttribute('aria-busy', 'false'); await expect(card.locator('.calendar-cell')).toHaveCount(12);
    const folder = path.resolve('artifacts/finance-overview'); fs.mkdirSync(folder, { recursive: true }); await page.screenshot({ path: path.join(folder, `calendar-${width}-${theme}.png`), fullPage: true });
    expect(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await card.getByRole('button', { name: '收支概览：年', exact: true }).click(); await expect(card).toHaveAttribute('aria-busy', 'false'); await expect(card.locator('.calendar-date-controls')).toHaveCount(0);
    expect((await card.locator('.calendar-year-row').first().boundingBox()).height).toBe(40);
    expect(fixture.calls.some(value => value.includes('statisticsByMonth'))).toBe(false);
  });
}
test('概览空态与失败重试保留卡片高度，底层二级锁不读取统计', async ({ page }) => {
  const fixture = await setup(page, { empty: true, fail: true }); const card = page.locator('[aria-label="收支概览首页卡片"]');
  await expect(card).toContainText('模拟概览失败'); const before = await card.boundingBox(); fixture.state.fail = false;
  await card.getByRole('button', { name: '重试', exact: true }).click(); await expect(card).toHaveAttribute('aria-busy', 'false');
  expect((await card.boundingBox()).height).toBe(before.height); await expect(card.getByRole('button', { name: '查看结余' })).toContainText('0.00');
  await page.unrouteAll({ behavior: 'wait' }); await page.goto('about:blank'); const locked = await setup(page, { locked: true });
  await expect(card).toContainText('点击解锁'); expect(locked.calls).not.toContain('/home/sections/finance/calendar');
});
test('概览零结余格子可点，明细可切收支，旧类型响应不回填', async ({ page }) => {
  await setup(page);
  await page.route('**/api/home/sections/finance/calendar?*', route => {
    const data = calendarFixture(new URL(route.request().url()), 'finance'); data.buckets[0].amount = 0; data.buckets[0].balance = 0; data.buckets[0].income = 2345.67; data.buckets[0].expense = 2345.67;
    return route.fulfill({ json: { code: 0, data } });
  });
  let release; const queries = [];
  await page.route('**/api/expense/query?*', route => { queries.push('expense'); return route.fulfill({ json: { code: 0, data: { items: Array.from({ length: 20 }, (_, index) => ({ id: 'expense-' + index, amt: index ? 0 : 2345.67, expDesc: '实际支出明细' + index + ' 保留此前明细直到新类型加载成功', expTime: '2026-10-01 10:00:00' })), total: 20 } } }); });
  await page.route('**/api/income/query?*', async route => { queries.push('income'); await new Promise(resolve => { release = resolve; }); return route.fulfill({ json: { code: 0, data: { items: [{ id: 'income-1', amt: 2345.67, remark: '迟到收入明细', incDate: '2026-10-01' }], total: 1 } } }); });
  const card = page.locator('[aria-label="收支概览首页卡片"]'); await expect(card).toHaveAttribute('aria-busy', 'false');
  await card.getByRole('button', { name: '刷新收支概览', exact: true }).click(); await expect(card).toHaveAttribute('aria-busy', 'false');
  await card.locator('.calendar-cell').first().click(); const dialog = page.getByRole('dialog', { name: '收支明细' });
  await expect(dialog).toContainText('实际支出明细'); const previousHeight = (await dialog.boundingBox()).height; await dialog.getByRole('button', { name: '收入明细', exact: true }).click(); await expect.poll(() => typeof release).toBe('function');
  await expect(dialog).toContainText('实际支出明细'); await expect(dialog.getByRole('button', { name: '支出明细', exact: true })).toHaveAttribute('aria-pressed', 'true'); expect((await dialog.boundingBox()).height).toBe(previousHeight);
  await dialog.getByRole('button', { name: '支出明细', exact: true }).click(); await expect(dialog).toContainText('实际支出明细'); release(); await expect(dialog).not.toContainText('迟到收入明细');
  expect(queries).toEqual(['expense', 'income', 'expense']);
});
test('概览保留收入支出导航与记一笔入口', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: '记一笔', exact: true }).click(); await page.getByText('记收入', { exact: true }).click();
  await expect(page).toHaveURL(/income\?create=1/); await expect(page.getByRole('dialog')).toBeVisible();
});
