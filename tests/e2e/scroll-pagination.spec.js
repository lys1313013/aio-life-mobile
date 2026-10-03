const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');
const scenarios = [
  ['finance/expense', '/expense/query', '.expense-row', 50],
  ['finance/income', '/income/query', '.income-row', 50],
  ['messages/index', '/message/admin/list', '.message', 30],
  ['records/notes', '/thought/query', '.note-card', 30],
  ['records/feedback', '/feedback/my', '.feedback-card', 30],
  ['records/library?kind=read', '/read-record/page', '.library-card', 30],
  ['admin/index?kind=users', '/user-center/list', '.admin-card', 20],
];
function rows(page, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(page * 1000 + index), title: `模拟第${page}页记录${index}`, content: `模拟第${page}页内容${index}`, summary: '模拟多行摘要',
    amt: page * 100 + index, transactionAmt: page * 100 + index, expTypeId: '81', incTypeId: '81', payTypeId: '82',
    expTime: '2026-10-01 12:00:00', incDate: '2026-10-01', remark: `模拟第${page}页记录${index}`,
    createTime: '2026-10-01 12:00:00', updateTime: '2026-10-01 12:00:00', username: `fixture-${page}-${index}`, nickname: `模拟用户${page}-${index}`,
    status: 'PENDING', feedbackType: 'BUG', role: 'user', author: '模拟作者', type: 1,
  }));
}
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
async function scrollBottom(page) {
  const scroller = page.locator('.mobile-page-scroll .uni-scroll-view[style]').first();
  await page.locator('.mobile-page-scroll').hover();
  // 锁定版本 uni-h5 对 scrolltolower 有 200ms 节流（含页面初次触底）。
  // 避开框架节流后再验证业务去重，避免单次瞬移滚轮在初始化窗口被吞掉。
  await page.waitForTimeout(220);
  const bottom = await scroller.evaluate(el => el.scrollHeight - el.clientHeight);
  await page.mouse.wheel(0, 100000);
  // wheel() 只发送输入；等待浏览器实际滚动，不能提前断言接口状态。
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(bottom - 1);
}
async function moveAway(page) {
  await page.locator('.mobile-page-scroll').hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(() => page.locator('.mobile-page-scroll .uni-scroll-view[style]').first().evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeGreaterThan(100);
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
for (const [path, endpoint, selector, size] of scenarios) {
  test(`触底加载、失败重试与防重入 ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 });
    await setup(page);
    const requests = [], pending = gate();
    let fail = true;
    await page.route('**/api' + endpoint + '?**', async route => {
      const url = new URL(route.request().url());
      const number = Number(url.searchParams.get('page') || url.searchParams.get('current') || 1);
      requests.push(number);
      if (number === 2 && fail) return route.fulfill({ json: { rscode: '1', result: '模拟分页失败，已保留列表' } });
      if (number === 2) await pending.promise;
      await route.fulfill({ json: { rscode: '0', data: { items: rows(number, number === 1 ? size : 2), total: size + 2 } } });
    });
    await page.goto('/#/pages/' + path);
    if (path === 'messages/index') {
      await page.setViewportSize({ width: 768, height: 850 });
      await page.locator('uni-picker[aria-label="频道"]').click();
      await page.locator('.uni-picker-item').filter({ hasText: /^管理$/ }).filter({ visible: true }).click();
    }
    await expect(page.locator(selector)).toHaveCount(size);
    await expect(page.getByRole('button', { name: /继续加载|加载更多|下一页/ })).toHaveCount(0);
    await scrollBottom(page);
    await expect(page.locator('.load-more-error')).toContainText('模拟分页失败');
    await expect(page.locator(selector)).toHaveCount(size);
    await moveAway(page); await scrollBottom(page);
    expect(requests).toEqual([1, 2]);
    fail = false;
    await page.getByRole('button', { name: '重试加载', exact: true }).click();
    await expect(page.getByRole('status', { name: '正在加载更多', exact: true })).toBeVisible();
    await moveAway(page); await scrollBottom(page);
    expect(requests).toEqual([1, 2, 2]);
    pending.release();
    await expect(page.locator(selector)).toHaveCount(size + 2);
    await moveAway(page); await scrollBottom(page);
    await expect(page.locator('.load-more')).toHaveCount(0);
    expect(requests).toEqual([1, 2, 2]);
    fs.mkdirSync('artifacts/scroll-pagination', { recursive: true });
    await page.screenshot({ path: 'artifacts/scroll-pagination/' + path.split('?')[0].replaceAll('/', '-') + '.png' });
  });
}

test('支出空末页停止请求，筛选后忽略旧分页结果', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await setup(page);
  const pending = gate(), requests = [];
  let reset = false, empty = false;
  await page.route('**/api/expense/query?**', async route => {
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    requests.push(number);
    if (number === 2 && !empty) await pending.promise;
    await route.fulfill({ json: { rscode: '0', data: { items: number === 2 && empty ? [] : rows(number, reset ? 1 : 50), total: reset ? 1 : 100 } } });
  });
  await page.goto('/#/pages/finance/expense');
  await expect(page.locator('.expense-row')).toHaveCount(50);
  await scrollBottom(page);
  await expect(page.getByRole('status', { name: '正在加载更多', exact: true })).toBeVisible();
  reset = true;
  await page.getByRole('button', { name: '筛选', exact: true }).scrollIntoViewIfNeeded();
  // The filter action is disabled while loading; refresh may supersede pagination.
  const { pullDown } = require('./gestures');
  await pullDown(page, '.mobile-page-scroll');
  await expect(page.locator('.expense-row')).toHaveCount(1);
  pending.release();
  await expect(page.locator('.load-more')).toHaveCount(0);
  await expect(page.locator('.expense-row')).toHaveCount(1);
  reset = false; empty = true;
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page.locator('.expense-row')).toHaveCount(50);
  await scrollBottom(page);
  await expect.poll(() => requests).toEqual([1, 2, 1, 1, 2]);
  await expect(page.locator('.load-more')).toHaveCount(0);
  await moveAway(page); await scrollBottom(page);
  expect(requests).toEqual([1, 2, 1, 1, 2]);
});
