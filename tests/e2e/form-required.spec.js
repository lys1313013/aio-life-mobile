const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures');

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`弹窗必填标记与保存校验 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const state = await setup(page);
      await page.goto('/#/pages/member/index');
      await page.getByRole('button', { name: '新增订阅', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '新增订阅', exact: true });
      await expect(dialog.locator('.required-mark')).toHaveCount(2);
      await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveAttribute('aria-required', 'true');
      await expect(dialog.locator('uni-picker[aria-label="到期日期"]')).toHaveAttribute('aria-required', 'true');
      await expect(dialog.locator('uni-picker[aria-label="开通日期"]')).toHaveAttribute('aria-required', 'false');
      await expect(dialog.locator('.required-mark').first()).toHaveCSS('color', 'rgb(224, 82, 96)');
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText('请输入会员名称和到期日期');
      expect(state.writes.filter(item => item.path === '/api/membership')).toHaveLength(0);
      await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('模拟免费订阅');
      await dialog.getByRole('button', { name: '1月', exact: true }).click();
      await dialog.locator('input[aria-label="价格"]').fill('0');
      await page.screenshot({ path: `artifacts/form-required/${width}-${theme}.png` });
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(state.writes.filter(item => item.path === '/api/membership').at(-1).body).toMatchObject({
        name: '模拟免费订阅', price: 0, monthlyAmount: null,
      });
    });
  }
}
