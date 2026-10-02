const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
async function openExpense(page) {
  await setup(page);
  const rows = [
    { id: '9007199254741001', amt: 12, transactionAmt: 12, expTypeId: '81', payTypeId: '82', expTime: '2026-09-02 00:00:00', remark: '模拟午餐', transactionId: 'hidden-order', transactionStatus: '支付成功' },
    { id: '9007199254741002', amt: 20, transactionAmt: 25, expTypeId: '81', payTypeId: '82', expTime: '2026-09-01 12:30:00', expDesc: '模拟食堂(99999999999999999999)', counterparty: '模拟餐饮公司' },
  ];
  const state = { rows, deleted: [], fail: true };
  await page.route('**/api/expense/query*', route => route.fulfill({ json: { rscode: '0', data: { items: state.rows, total: state.rows.length } } }));
  await page.route('**/api/expense/900719925474100*', route => {
    state.deleted.push(route.request().url().split('/').at(-1));
    if (state.fail) return route.fulfill({ json: { rscode: '1', result: '模拟删除失败' } });
    state.rows = state.rows.filter(row => row.id !== state.deleted.at(-1));
    return route.fulfill({ json: { rscode: '0', data: true } });
  });
  await page.goto('/#/pages/finance/expense');
  await expect(page.locator('.expense-row')).toHaveCount(2);
  return state;
}
async function swipe(page, index, dx, dy = 0) {
  const card = page.locator('.ledger-content').nth(index);
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const x = box.x + box.width * (dx < 0 ? 0.8 : 0.2), y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let n = 1; n <= 5; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * n / 5, y: y + dy * n / 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}
test('支出列表去掉冗余信息，点击编辑，批量模式才显示选择框', async ({ page }) => {
  await openExpense(page);
  await expect(page.locator('.expense-row').first()).not.toContainText(/hidden-order|支付成功|交易金额/);
  await expect(page.locator('.expense-row').nth(1)).toContainText('交易金额 ¥25.00');
  await expect(page.locator('.ledger-summary').nth(1)).toHaveText('模拟食堂');
  await expect(page.locator('.ledger-select')).toHaveCount(0);
  await page.locator('.ledger-body').first().click();
  await expect(page.getByRole('dialog', { name: '编辑支出', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '批量选择', exact: true }).click();
  await expect(page.locator('.ledger-select')).toHaveCount(2);
  await page.locator('.ledger-select').first().getByRole('button').click();
  await expect(page.getByRole('button', { name: '删除选中 1 笔', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出批量选择', exact: true }).click();
  await expect(page.locator('.ledger-select')).toHaveCount(0);
});
test('左滑不误触编辑，删除失败可重试且使用字符串 ID', async ({ page }) => {
  const state = await openExpense(page);
  await swipe(page, 0, -100);
  await expect(page.locator('.ledger-delete')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '编辑支出', exact: true })).toHaveCount(0);
  await page.locator('.ledger-delete').getByRole('button', { name: '删除支出', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('模拟删除失败');
  await expect(page.locator('.expense-row')).toHaveCount(2);
  state.fail = false;
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.expense-row')).toHaveCount(1);
  expect(state.deleted).toEqual(['9007199254741001', '9007199254741001']);
  await expect(page.locator('.filter-footer')).toContainText('1 笔 · 已加载合计 ¥20.00');
});
test('纵向手势不展开删除；换行左滑收起上一行，右滑关闭', async ({ page }) => {
  await openExpense(page);
  await swipe(page, 0, -5, -45);
  await expect(page.locator('.ledger-delete')).toHaveCount(0);
  await swipe(page, 0, -100);
  await swipe(page, 1, -100);
  await expect(page.locator('.expense-row').first().locator('.ledger-delete')).toHaveCount(0);
  await expect(page.locator('.expense-row').nth(1).locator('.ledger-delete')).toHaveCount(1);
  await swipe(page, 1, 100);
  await expect(page.locator('.ledger-delete')).toHaveCount(0);
});
