const { test, expect } = require('./support/test');
const { picker } = require('./qa-domains-ui');
const { pullDown } = require('./gestures');
const fs = require('node:fs');
const path = require('node:path');
const routes = ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'];
const ok = data => ({ json: { code: 0, message: null, data } });
const row = (year, month, amt, typeName) => ({ year, month, detail: [{ typeId: '9223372036854775807', typeName, amt }] });
const income = [row(2025, 12, 1000, '工资'), row(2026, 1, 2000, '工资'), row(2026, 2, 3000, '年度奖金与其他收入的长分类名称')];
const expense = [row(2025, 12, 400, '餐饮'), row(2026, 1, 500, '餐饮'), row(2026, 2, 300, '交通')];
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
async function setup(page, apiMock, { theme = 'light', empty = false, fail = false, pending = null } = {}) {
  const state = { empty, fail, pending, calls: [] };
  await page.addInitScript(theme => {
    localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'finance-statistics-fixture' }));
    localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
  }, theme);
  const statistics = kind => async request => {
    state.calls.push(new URL(request.url()).pathname);
    if (state.pending) await state.pending.promise;
    return state.fail ? { json: { code: 1, message: '模拟概览失败', data: null } } : ok(state.empty ? [] : kind === 'income' ? income : expense);
  };
  apiMock({
    'GET /api/user/info': ok({ id: 'finance-fixture', nickname: '模拟用户' }),
    'GET /api/menu/all': ok(routes.map((path, index) => ({ path, meta: { menuId: 'finance-' + index } }))),
    'GET /api/quick-nav/candidates': ok(routes.map(path => ({ path }))),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/income/statisticsByMonth': statistics('income'),
    'GET /api/expense/statisticsByMonth': statistics('expense'),
    'GET /api/income/query': ok({ items: [], total: 0 }),
    'GET /api/expense/query': ok({ items: [], total: 0 }),
    'GET /api/userDictType/getByDictType': ok({ dictDetailList: [] }),
    'GET /api/sysDictType/getByDictType': ok({ dictDetailList: [] }),
  });
  await page.goto('/#/pages/finance/index');
  return state;
}
for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`财务统计概览 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    const pending = gate();
    try {
      const state = await setup(page, apiMock, { theme, pending });
      await expect(page.getByRole('status', { name: '正在加载总收入', exact: true })).toBeVisible();
      const before = await page.locator('.metrics').boundingBox();
      pending.release();
      await expect(page.locator('.summary-number')).toHaveText(['6,000.00', '1,200.00', '4,800.00', '80.0']);
      expect(Math.abs((await page.locator('.metrics').boundingBox()).height - before.height)).toBeLessThanOrEqual(2);
      await expect(page.getByRole('figure', { name: '年度收支趋势', exact: true })).toBeVisible();
      await expect(page.getByRole('figure', { name: '累计结余趋势', exact: true })).toBeAttached();
      await expect(page.getByRole('figure', { name: '收入构成', exact: true })).toContainText('年度奖金与其他收入的长分类名称');
      await expect(page.getByRole('figure', { name: '支出构成', exact: true })).toContainText('餐饮');
      await expect(page.getByRole('figure', { name: '每年结余占比', exact: true })).toContainText('2025');
      await expect(page.getByRole('region', { name: '年度明细', exact: true })).toContainText('4,200.00');
      await expect(page.locator('[aria-label="收支概览首页卡片"]')).toHaveCount(0);
      const folder = path.resolve('artifacts/finance-overview'); fs.mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: path.join(folder, `statistics-${width}-${theme}.png`), fullPage: true });
      await picker(page, '年份', '2026');
      await expect(page.locator('.summary-number')).toHaveText(['5,000.00', '800.00', '4,200.00', '84.0']);
      await expect(page.getByRole('figure', { name: '月度收支趋势', exact: true })).toBeVisible();
      const detail = page.getByRole('region', { name: '月度明细', exact: true });
      await detail.scrollIntoViewIfNeeded();
      await expect(detail).toContainText('2026-02');
      await detail.getByRole('button', { name: '2026-02累计结余' }).click();
      await expect(detail).toContainText('所选范围累计结余');
      await page.screenshot({ path: path.join(folder, `statistics-detail-${width}-${theme}.png`), fullPage: true });
      expect(await page.locator('.ui-page-body').evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
      expect(state.calls.sort()).toEqual(['/api/expense/statisticsByMonth', '/api/income/statisticsByMonth']);
    } finally { pending.release(); }
  });
}
test('概览失败重试、空态刷新和已有统计刷新保持内容', async ({ page, apiMock }) => {
  const state = await setup(page, apiMock, { fail: true, empty: true });
  await expect(page.getByText('模拟概览失败', { exact: true })).toBeVisible();
  state.fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('暂无收支记录', { exact: true })).toBeVisible();
  const pending = gate(); state.pending = pending;
  try {
    await pullDown(page, '.mobile-page-scroll');
    await expect(page.getByRole('status', { name: '正在更新内容', exact: true })).toBeVisible();
    await expect(page.getByText('暂无收支记录', { exact: true })).toBeVisible();
    state.empty = false; pending.release();
    await expect(page.locator('.summary-number').first()).toHaveText('6,000.00');
    state.pending = gate();
    const before = await page.locator('.metrics').boundingBox();
    await pullDown(page, '.mobile-page-scroll');
    await expect(page.getByRole('status', { name: '正在更新内容', exact: true })).toBeVisible();
    await expect(page.locator('.summary-number').first()).toHaveText('6,000.00');
    expect((await page.locator('.metrics').boundingBox()).height).toBe(before.height);
    state.fail = true; state.pending.release();
    await expect(page.getByRole('alert', { name: '更新失败：模拟概览失败' })).toBeVisible();
    await expect(page.locator('.summary-number').first()).toHaveText('6,000.00');
    state.fail = false; state.pending = null;
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.locator('.page-state')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { pending.release(); state.pending?.release(); }
});
test('概览保留收入支出导航与记一笔入口', async ({ page, apiMock }) => {
  await setup(page, apiMock);
  await expect(page.locator('.summary-number').first()).toHaveText('6,000.00');
  await page.getByRole('button', { name: '记一笔', exact: true }).click();
  await page.getByText('记收入', { exact: true }).click();
  await expect(page).toHaveURL(/income\?create=1/);
  await expect(page.getByRole('dialog')).toBeVisible();
});
