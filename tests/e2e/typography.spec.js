const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures');
const { roles } = require('../../src/styles/typography.json');

async function expectRole(locator, role, checkLineHeight = true) {
  const style = roles[role];
  await expect(locator.first()).toBeVisible();
  for (const element of await locator.all()) {
    await expect(element).toHaveCSS('font-size', `${style.size}px`);
    await expect(element).toHaveCSS('font-weight', String(style.weight));
    if (checkLineHeight) await expect(element).toHaveCSS('line-height', `${style.lineHeight}px`);
  }
}

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`统一排版实际渲染 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await setup(page);

      // 普通表单与图表文字必须直接消费语义角色，不能依赖 view 继承。
      await page.goto('/#/pages/records/exercise');
      await expectRole(page.locator('.form-field-label'), 'label');
      await expectRole(page.locator('.form-field-picker-value'), 'body');
      await expectRole(page.locator('.chart-y-tick'), 'caption');
      await expectRole(page.locator('.chart-x-label'), 'caption');
      await expectRole(page.locator('.chart-value-number'), 'caption-strong');

      // soft 外观使用相同的表单尺度；标题/按钮保留各自语义。
      await page.goto('/#/pages/goods/devices');
      await page.getByRole('button', { name: '新增设备', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expectRole(dialog.locator('.device-editor-title'), 'title');
      await expectRole(dialog.locator('.form-field-label'), 'label');
      await expectRole(dialog.locator('.form-field-picker-value'), 'body');
      await expectRole(dialog.locator('.form-field-input'), 'body');
      await expectRole(dialog.locator('.mobile-button:not(.mobile-button-icon)'), 'body', false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
