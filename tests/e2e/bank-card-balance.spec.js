const { test, expect } = require('./support/test');
const { setup } = require('./qa-domains-fixtures');

async function chooseType(page, dialog, value) {
  const picker = dialog.locator('uni-picker[aria-label="类型"]');
  const previous = (await picker.innerText()).includes('信用卡') ? 1 : 0;
  await picker.click();
  await page.locator('.uni-picker-select:visible, .uni-picker-view-indicator:visible').first().waitFor();
  if (await page.locator('.uni-picker-select:visible').count()) {
    await page.locator('.uni-picker-select:visible').getByText(value, { exact: true }).click();
    return;
  }
  await page.waitForTimeout(350);
  const box = await page.locator('.uni-picker-view-indicator').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const delta = (value === '信用卡' ? 1 : 0) - previous;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - box.height * delta * i / 8 }] });
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  await page.locator('.uni-picker-action-confirm:visible').click();
  await cdp.detach();
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`银行卡余额保存、清空、失败恢复及类型切换 ${width} ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, baseURL);
    state.cards[0] = { ...state.cards[0], cardType: 'debit', balance: '0.00', creditLimit: null };
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(`${baseURL}/api/bank-cards`, async route => {
      await gate;
      await route.fulfill({ json: { code: 0, data: state.cards } });
    });
    await page.goto('/#/pages/finance/cards');
    await expect(page.locator('.card')).toHaveCount(4);
    const loadingHeight = (await page.locator('.card').first().boundingBox()).height;
    release();
    await expect(page.locator('.card')).toHaveCount(1);
    const contentHeight = (await page.locator('.card').first().boundingBox()).height;
    expect(Math.abs(contentHeight - loadingHeight)).toBeLessThan(1);
    await expect(page.locator('.card').getByText('余额：0 元', { exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/bank-card-balance/${width}-${theme}-list.png`, fullPage: true });
    const dialog = page.getByRole('dialog', { name: '银行卡', exact: true });
    async function edit() {
      await page.getByRole('button', { name: '银行卡更多操作', exact: true }).click();
      await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
      await expect(dialog).toBeVisible();
    }
    await edit();
    const balance = dialog.getByRole('spinbutton', { name: '余额（元）', exact: true });
    await balance.fill('9999999999999999.99');
    await page.screenshot({ path: `artifacts/bank-card-balance/${width}-${theme}-editor.png`, fullPage: true });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.at(-1).body.balance).toBe('9999999999999999.99');
    await expect(page.locator('.card').getByText('余额：9,999,999,999,999,999.99 元', { exact: true })).toBeVisible();
    await edit();
    await balance.fill('');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.at(-1).body.balance).toBeNull();
    await expect(page.locator('.card .card-meta')).toHaveCount(0);
    await edit();
    for (const invalid of ['-0.01', '1.001', '10000000000000000']) {
      await balance.fill(invalid);
      const count = state.calls.length;
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog.getByText(/余额须为非负金额/)).toBeVisible();
      expect(state.calls.length).toBe(count);
    }
    await balance.fill('0');
    state.fail = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('模拟保存失败', { exact: true })).toBeVisible();
    await expect(balance).toHaveValue('0');
    state.fail = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await edit();
    await chooseType(page, dialog, '信用卡');
    await expect(balance).toHaveCount(0);
    const credit = dialog.getByRole('spinbutton', { name: '信用额度（元）', exact: true });
    await credit.fill('50000.50');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.at(-1).body.balance).toBeNull();
    expect(state.calls.at(-1).body.creditLimit).toBe('50000.50');
    await expect(page.locator('.card').getByText('信用额度：50,000.5 元', { exact: true })).toBeVisible();
    await edit();
    await credit.fill('');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.card .card-meta')).toHaveCount(0);
    await edit();
    await chooseType(page, dialog, '储蓄卡');
    await balance.fill('12.34');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.at(-1).body).toMatchObject({ balance: '12.34', creditLimit: null, statementDay: null, repaymentDay: null });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
