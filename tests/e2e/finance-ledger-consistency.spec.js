const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const { pullDown } = require('./gestures');

async function ledger(page, kind, count) {
  await setup(page, test.info().project.use.baseURL);
  const state = { rows: Array.from({ length: count }, (_, i) => ({
    id: String(i + 1), amt: 1, transactionAmt: 1, expTypeId: '81', incTypeId: '81', payTypeId: '82',
    expTime: '2026-10-01 12:00:00', incDate: '2026-10-01', remark: `模拟账单${i + 1}`,
  })), requests: [], failStats: false };
  await page.route(`**/api/${kind}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/query')) {
      const current = Number(url.searchParams.get('page') || 1);
      state.requests.push(current);
      return route.fulfill({ json: { rscode: '0', data: { items: state.rows.slice((current - 1) * 50, current * 50), total: state.rows.length } } });
    }
    if (/statisticsBy/.test(url.pathname)) {
      if (state.failStats) return route.fulfill({ json: { rscode: '1', result: '模拟统计失败，可单独重试' } });
      return route.fulfill({ json: { rscode: '0', data: [{ year: new Date().getFullYear(), month: 10, detail: [{ typeName: '模拟分类', amt: state.rows.reduce((n, x) => n + Number(x.amt), 0) }] }] } });
    }
    if (route.request().method() === 'DELETE') {
      state.rows = state.rows.filter(x => x.id !== url.pathname.split('/').at(-1));
      return route.fulfill({ json: { rscode: '0', data: true } });
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      Object.assign(state.rows.find(x => x.id === url.pathname.split('/').at(-1)), payload);
      return route.fulfill({ json: { rscode: '0', data: true } });
    }
    return route.fallback();
  });
  await page.goto(`/#/pages/finance/${kind}`);
  await expect(page.locator(`.${kind}-row`)).toHaveCount(Math.min(count, 50));
  return state;
}
for (const kind of ['expense', 'income']) test(`${kind} 删除首屏后真实滚动加载不漏账单`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const state = await ledger(page, kind, 101);
  await page.locator('.ledger-body').first().click();
  const dialog = page.getByRole('dialog', { name: kind === 'expense' ? '编辑支出' : '编辑收入', exact: true });
  await dialog.getByRole('button', { name: kind === 'expense' ? '删除支出' : '删除收入', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`.${kind}-row`)).toHaveCount(50);
  await page.locator('.mobile-page-scroll').hover();
  await page.mouse.wheel(0, 100000);
  await expect(page.locator(`.${kind}-row`)).toHaveCount(100);
  const summaries = await page.locator('.ledger-summary').allTextContents();
  expect(summaries).toContain('模拟账单51');
  expect(new Set(summaries).size).toBe(100);
  expect(state.requests).toEqual([1, 1, 2]);
  await expect(page.locator('.summary-total .metric-number')).toHaveText('100.00');
});
test('保存及下拉刷新同步统计，统计失败保留内容且可以独立重试', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const state = await ledger(page, 'income', 1);
  await expect(page.locator('.summary-total .metric-number')).toHaveText('1.00');
  await page.locator('.ledger-body').first().click();
  const dialog = page.getByRole('dialog', { name: '编辑收入', exact: true });
  await dialog.getByRole('spinbutton', { name: '金额', exact: true }).fill('200');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.summary-total .metric-number')).toHaveText('200.00');
  state.rows.push({ ...state.rows[0], id: 'external', amt: 40, remark: '模拟外部新增' });
  state.failStats = true;
  await pullDown(page, '.mobile-page-scroll');
  await expect(page.locator('.income-row')).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText('模拟统计失败');
  await expect(page.locator('.summary-total .metric-number')).toHaveText('200.00');
  state.failStats = false;
  await page.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.summary-total .metric-number')).toHaveText('240.00');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
