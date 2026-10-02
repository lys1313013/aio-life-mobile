const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-platform-fixtures');

for (const width of [320, 390, 768, 1440]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`顶部日期与搜索 ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await setup(page, true);
      await page.route('**/api/menu/preferences', route => route.fulfill({ json: {
        rscode: '0', data: { menus: [{ id: 'category', title: '个人分类', children: [] }], hiddenMenuIds: [] },
      } }));
      await page.goto('/#/pages/time/index');
      const header = page.locator('.page-navigation');
      const date = header.locator('.date-value');
      await expect(date).toBeVisible();
      const original = await date.textContent();
      await header.getByRole('button', { name: '前一天', exact: true }).click();
      await expect(date).not.toHaveText(original);
      await header.getByRole('button', { name: '后一天', exact: true }).click();
      await expect(date).toHaveText(original);
      for (const name of ['前一天', '后一天']) {
        const box = await header.getByRole('button', { name, exact: true }).boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.getByRole('button', { name: '周视图', exact: true }).click();
      await expect(header.getByRole('button', { name: '上一周期', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('time.png') });
      await page.locator('uni-tabbar').getByText('生活', { exact: true }).click();
      const search = header.locator('[aria-label="搜索功能"] input');
      await search.fill('不存在的模拟功能');
      await expect(page.getByText('未找到相关功能', { exact: true })).toBeVisible();
      await header.getByRole('button', { name: '清空搜索', exact: true }).click();
      await expect(search).toHaveValue('');
      await expect(page.getByRole('button', { name: '个人分类', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('life.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
