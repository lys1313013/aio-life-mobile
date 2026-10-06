const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
async function setup(page, mode) {
  await page.addInitScript(({ mode }) => {
    localStorage.setItem('aio-life-mobile.access-token.v1', 'order-fixture');
    localStorage.setItem('bank-card-view-mode', mode);
  }, { mode });
  const state = { fail: false, calls: [], rows: Array.from({ length: 8 }, (_, i) => ({
    id: String(9007199254740993n + BigInt(i)), name: `模拟卡面 ${i + 1}`, bankName: `模拟银行 ${i + 1}`, bankId: '9', bankCode: 'DEMO', cardName: `模拟卡 ${i + 1}`, cardType: 'debit', sortOrder: i,
    cardNoLast4: '1234', coverFileIds: [], tags: [], status: 'normal', coverColor: '#334766', fileId: 'a'.repeat(32), isEnabled: 1, usageCount: '0',
  })) };
  const fixtures = {
    '/user/info': { id: '1', nickname: '模拟用户', roles: ['admin'] },
    '/menu/list': [], '/menu/all': [], '/auth/secondary-lock/menus': [],
    '/bank-cards/banks': [{ id: '9', name: '模拟银行', enabled: true }], '/bank-cards/tags': [],
    '/system/bank-card-covers/banks': [{ id: '9', name: '模拟银行', enabled: true }],
  };
  for (const [path, data] of Object.entries(fixtures)) await page.route('**/api' + path, route => route.fulfill({ json: { code: 0, data } }));
  for (const path of ['/bank-cards', '/system/bank-card-covers']) {
    await page.route('**/api' + path, route => route.fulfill({ json: { code: 0, data: state.rows } }));
    await page.route('**/api' + path + '/order', async route => {
      const move = route.request().postDataJSON(); state.calls.push(move);
      await new Promise(resolve => setTimeout(resolve, 180));
      if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟排序失败' } });
      const list = [...state.rows].sort((a, b) => a.sortOrder - b.sortOrder);
      const [item] = list.splice(list.findIndex(row => row.id === move.id), 1);
      list.splice(list.findIndex(row => row.id === move.targetId) + (move.after ? 1 : 0), 0, item);
      state.rows = list.map((row, sortOrder) => ({ ...row, sortOrder }));
      await route.fulfill({ json: { code: 0, data: state.rows.map(({ id, sortOrder }) => ({ id, sortOrder })) } });
    });
  }
  await page.route('**/api/file/preview/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" rx="30" fill="#334766"/><text x="60" y="100" fill="white" font-size="40">DEMO BANK</text></svg>' }));
  return state;
}
async function touch(cdp, type, x = 0, y = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: ['touchEnd', 'touchCancel'].includes(type) ? [] : [{ x, y, id: 1 }] });
}
async function drag(page, cancel = false) {
  const cdp = await page.context().newCDPSession(page);
  const items = page.locator('.card-sort-item');
  const a = await items.nth(0).boundingBox(), b = await items.nth(1).boundingBox();
  const x = a.x + 65, y = a.y + 30;
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(380);
  await expect(page.locator('.card-order-dragging')).toHaveCount(1);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', x, y + (b.y + 35 - y) * i / 8);
  await expect(page.locator('.card-order-after')).toHaveCount(1);
  await touch(cdp, cancel ? 'touchCancel' : 'touchEnd');
  await cdp.detach();
}
for (const mode of ['stack', 'grid', 'covers']) test(`长按排序保存取消与回滚 ${mode}`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = await setup(page, mode);
  const path = mode === 'covers' ? '/#/pages/admin/bank-card-covers' : '/#/pages/finance/cards';
  await page.goto(path);
  await expect(page.locator('.card-sort-item')).toHaveCount(8);
  const first = state.rows[0].id, second = state.rows[1].id;
  await drag(page);
  await expect.poll(() => state.calls.length).toBe(1);
  expect(state.calls[0]).toEqual({ id: first, targetId: second, after: true });
  await expect(page.locator('.card-sort-item').first()).toHaveAttribute('data-card-id', second);
  await expect(page.locator('.card-sort-item[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.card-sort-item').first()).toHaveAttribute('data-card-id', second);
  await drag(page, true);
  expect(state.calls.length).toBe(1);
  await expect(page.locator('.card-sort-item').first()).toHaveAttribute('data-card-id', second);
  state.fail = true;
  await drag(page);
  await expect.poll(() => state.calls.length).toBe(2);
  await expect(page.locator('.card-sort-item[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.card-sort-item').first()).toHaveAttribute('data-card-id', second);
  await fs.mkdir('artifacts/card-order', { recursive: true });
  for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({ path: `artifacts/card-order/${mode}-${width}-${theme}.png` });
  }
  expect(errors).toEqual([]);
});

test('长按后靠近屏幕底部自动滚动，短滑仍可正常滚动', async ({ page }) => {
  const state = await setup(page, 'covers');
  await page.goto('/#/pages/admin/bank-card-covers');
  await expect(page.locator('.card-sort-item')).toHaveCount(8);
  const cdp = await page.context().newCDPSession(page);
  const first = await page.locator('.cover-edit').first().boundingBox();
  const x = first.x + 60, y = first.y + 30;
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(380);
  await expect(page.locator('.card-order-dragging')).toHaveCount(1);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', x, y + (875 - y) * i / 8);
  const scroller = page.locator('.mobile-page-scroll .uni-scroll-view').last();
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  await touch(cdp, 'touchCancel');
  expect(state.calls).toHaveLength(0);
  const before = await scroller.evaluate(node => node.scrollTop);
  await touch(cdp, 'touchStart', 170, 600);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', 170, 600 - i * 25);
  await touch(cdp, 'touchEnd');
  await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
  expect(state.calls).toHaveLength(0);
  await cdp.detach();
});
