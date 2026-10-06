const { test, expect } = require('@playwright/test');
const banks = Array.from({ length: 3000 }, (_, n) => ({ id: String(90071992547409930n + BigInt(n)), name: `模拟银行${n}`, code: `BANK${n}`, enabled: true }));
banks.push({ id: 'disabled', name: '模拟停用银行', code: 'OFF', enabled: false });
banks.push({ id: 'long', name: '模拟某省某市农村商业银行股份有限公司', code: 'LONG', enabled: true });
async function prepare(page, baseURL) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'bank-editor-fixture'));
  for (const [path, data] of Object.entries({
    '/user/info': { id: '1', nickname: '模拟用户', roles: ['admin'] },
    '/auth/secondary-lock/menus': [], '/bank-cards': [], '/bank-cards/banks': banks, '/bank-cards/tags': [],
  })) await page.route(`${baseURL}/api${path}`, route => route.fulfill({ json: { code: 0, data } }));
  await page.goto('/#/pages/finance/cards');
  await expect(page.getByText('暂无储蓄卡', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增银行卡', exact: true }).click();
  return page.getByRole('dialog', { name: '银行卡', exact: true });
}
test('三千家银行搜索、触底追加、停用、自定义及保存失败恢复', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let payload;
  const dialog = await prepare(page, baseURL);
  // 新增的精确替身只处理本次模拟提交。
  await page.route(`${baseURL}/api/bank-cards`, route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { code: 1, message: '模拟保存失败' } });
  });
  const input = dialog.getByRole('searchbox', { name: '银行', exact: true });
  await input.click();
  await expect(dialog.locator('.bank-option')).toHaveCount(40);
  await dialog.locator('.bank-results-scroll').hover();
  await page.mouse.wheel(0, 2200);
  await expect(dialog.locator('.bank-option')).toHaveCount(80);
  await input.fill('bank2999');
  await dialog.getByRole('button', { name: '选择模拟银行2999', exact: true }).click();
  await expect(input).toHaveValue('模拟银行2999');
  await expect(dialog.getByRole('button', { name: '选择公共卡面', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText('模拟保存失败', { exact: true })).toBeVisible();
  expect(payload.bankId).toBe(banks[2999].id);
  expect(payload.customBankName).toBeNull();
  await input.fill('停用');
  await expect(dialog.getByRole('button', { name: '选择模拟停用银行', exact: true })).toBeDisabled();
  await input.fill('未收录测试银行');
  await expect(dialog.getByText('未找到匹配银行')).toBeVisible();
  await dialog.getByRole('button', { name: '使用自定义银行', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '选择公共卡面', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  expect(payload.bankId).toBeNull();
  expect(payload.customBankName).toBe('未收录测试银行');
});
for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`银行卡编辑布局 ${width} ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const dialog = await prepare(page, baseURL);
    const input = dialog.getByRole('searchbox', { name: '银行', exact: true });
    await input.fill('LONG');
    await dialog.getByRole('button', { name: '选择' + banks.at(-1).name, exact: true }).click();
    await expect(dialog.locator('.draft-bank-name')).toHaveText(banks.at(-1).name);
    await expect.poll(async () => (await dialog.boundingBox()).height).toBeLessThan(780);
    const bounds = await dialog.boundingBox();
    const field = await input.boundingBox();
    const preview = await dialog.locator('.draft-face').boundingBox();
    expect(field.y).toBeLessThan(preview.y);
    expect(preview.height).toBeGreaterThan(150);
    expect(preview.height).toBeLessThan(180);
    expect(bounds.height).toBeLessThan(780);
    for (const button of await dialog.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    }
    await page.screenshot({ path: `artifacts/bank-card-editor/${width}-${theme}.png`, fullPage: true });
    await input.fill('模拟银行29');
    await expect(dialog.getByRole('button', { name: '选择模拟银行29', exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/bank-card-editor/${width}-${theme}-search.png`, fullPage: true });
  });
}
