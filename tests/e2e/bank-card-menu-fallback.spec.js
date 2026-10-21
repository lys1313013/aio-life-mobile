const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test.use({ hasTouch: true });
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`银行卡按钮测量失败仍可编辑保存 ${width} ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, baseURL, null);
    await page.goto('/#/pages/finance/cards');
    const face = page.locator('.card-face');
    await expect(face).toHaveCount(1);
    await face.tap();
    await expect(face).toHaveAttribute('aria-expanded', 'true');
    // 让真实选择器返回 null，模拟微信组件边界使按钮不可查询。
    await page.locator('.card-more').evaluate(node => node.removeAttribute('id'));
    await expect(page.locator('[id^="card-more-"]')).toHaveCount(0);
    await page.getByRole('button', { name: '银行卡更多操作', exact: true }).tap();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `artifacts/bank-card-menu-fallback/${width}-${theme}.png`, fullPage: true });
    await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: '银行卡', exact: true });
    await expect(dialog).toBeVisible();
    const limit = dialog.getByRole('spinbutton', { name: '信用额度（元）', exact: true });
    await expect(limit).toHaveValue('10000');
    await limit.fill('12345.67');
    state.fail = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(dialog.getByText('模拟保存失败', { exact: true })).toBeVisible();
    await expect(limit).toHaveValue('12345.67');
    state.fail = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.at(-1)).toMatchObject({ path: '/api/bank-cards/88', body: { creditLimit: '12345.67' } });
  });
}
