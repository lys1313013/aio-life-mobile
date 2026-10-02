const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-platform-fixtures');

for (const width of [390, 768, 1280]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`导航在内容滚动时固定 ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme });
      await setup(page, true);
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: String(i + 1), title: `模拟目标 ${i + 1}`, type: 1,
        status: 'in_progress', currentValue: 2, targetValue: 10,
        description: '用于验证长列表滚动时导航位置的模拟内容。',
        dictType: 'fixture', dictLabel: `模拟字典 ${i + 1}`,
        dictSort: i, isReadonly: 'N',
      }));
      await page.route('**/api/goals?*', route => route.fulfill({ json: { rscode: '0', data: rows } }));
      await page.route('**/api/userDictData/admin/query?*', route => route.fulfill({ json: { rscode: '0', data: { items: rows.map(row => ({ ...row, status: '0' })), total: rows.length } } }));
      // 分别覆盖导航在 MobilePage 内部和外部的两种用法。
      for (const [route, card] of [
        ['/pages/tasks/goals', '.record-card'],
        ['/pages/admin/index?kind=user-dict', '.admin-card'],
      ]) {
        await page.goto('/#' + route);
        await expect(page.locator(card)).toHaveCount(30);
        const header = page.locator('.page-navigation');
        const before = await header.boundingBox();
        const firstCard = await page.locator(card).first().boundingBox();
        expect(before.y).toBe(0);
        expect(firstCard.y).toBeGreaterThanOrEqual(before.height);
        const button = await page.getByRole('button', { name: '返回', exact: true }).boundingBox();
        expect(button.x).toBeCloseTo(12, 0);
        await page.mouse.move(width / 2, 650);
        await page.mouse.wheel(0, 600);
        await expect.poll(async () => (await page.locator(card).first().boundingBox()).y).toBeLessThan(firstCard.y - 100);
        expect(await header.boundingBox()).toEqual(before);
        await expect(page.getByRole('button', { name: '返回', exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`${route.includes('admin') ? 'admin' : 'goals'}.png`) });
      }
    });
  }
}
