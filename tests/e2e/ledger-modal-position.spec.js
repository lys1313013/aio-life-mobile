const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

// H5 回归视口几何与滚动行为；微信 root-portal 还需编译及真机验证。
for (const kind of ['expense', 'income']) {
  for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
    test(`滚动后收支弹窗保持视口居中 ${kind} ${width} ${theme}`, async ({ page }) => {
      const height = width === 390 ? 560 : 900;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await setup(page);
      const rows = Array.from({ length: 30 }, (_, index) => ({
        id: String(1000 + index), amt: 12, transactionAmt: 12,
        expTypeId: '81', incTypeId: '81', payTypeId: '82',
        expTime: '2026-10-11 12:00:00', incDate: '2026-10-11', remark: '模拟账目',
      }));
      await page.route(`**/api/${kind}/query*`, route => route.fulfill({ json: { code: 0, data: { items: rows, total: rows.length } } }));
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`/#/pages/finance/${kind}`);
      await expect(page.locator('.ledger-row')).toHaveCount(rows.length);
      const edit = page.locator('.ledger-body').nth(12);
      // 将列表中部账目滚入视口，保持非零滚动位置打开编辑。
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, 360);
      await edit.scrollIntoViewIfNeeded();
      // 图表自身也包含 scroll-view，读取页面内实际可滚动的容器，不能取最后一个嵌套图表。
      const scroll = page.locator('.mobile-page-scroll');
      await expect.poll(() => scroll.evaluate(root => {
        const pageScroll = Array.from(root.querySelectorAll('.uni-scroll-view'))
          .find(element => element.scrollHeight > element.clientHeight);
        return pageScroll?.scrollTop ?? 0;
      })).toBeGreaterThan(0);
      await edit.click();
      const dialog = page.getByRole('dialog', { name: kind === 'expense' ? '编辑支出' : '编辑收入', exact: true });
      await expect(dialog).toBeVisible();
      const mask = page.locator('.modal-mask');
      await expect.poll(async () => {
        const box = await mask.boundingBox();
        return box && [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
      }).toEqual([0, 0, width, height]);
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        return Math.abs(box.y + box.height / 2 - height / 2);
      }).toBeLessThan(2);
      const before = await dialog.boundingBox();
      expect(before.y).toBeGreaterThanOrEqual(24);
      expect(before.y + before.height).toBeLessThanOrEqual(height - 24);
      await page.screenshot({ path: `artifacts/modal-position/${kind}-${width}-${theme}.png` });

      // 短视口的长表单内部可滚动，操作栏不会跑到屏幕外。
      const cancel = dialog.getByRole('button', { name: '取消', exact: true });
      await cancel.scrollIntoViewIfNeeded();
      const after = await dialog.boundingBox();
      expect(Math.abs(after.y - before.y)).toBeLessThan(2);
      await expect(cancel).toBeInViewport();
      await cancel.click();
      await expect(dialog).toHaveCount(0);
      await edit.click();
      await expect(dialog).toBeVisible();
      await mask.click({ position: { x: 2, y: 2 } });
      await expect(dialog).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
