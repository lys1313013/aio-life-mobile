const { test, expect } = require('./support/test');
const { start } = require('./qa-domains-ui');
const spacing = require('../../src/styles/spacing.json');

for (const width of [390, 820, 1422]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`vault identity and shared FAB ${width} ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await start(page, 'vault/index', { existingVault: true });
      const card = page.locator('.vault-card').first();
      await expect(card.locator('.vault-website')).toHaveText('https://example.test');
      await expect(card).not.toContainText('fixture-user');
      await expect(card).not.toContainText('fixture-secret');
      const container = await page.locator('.mobile-page-content').boundingBox();
      const fab = await page.locator('.floating-action-anchor').boundingBox();
      expect(Math.abs(container.x + container.width - (fab.x + fab.width) - (spacing.page + spacing.inline))).toBeLessThan(2);
      expect(fab.y + fab.height).toBeLessThanOrEqual(900);
      await page.getByRole('button', { name: '新增密码', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '解锁密码库', exact: true })).toBeVisible();
    });
  }
}
