const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test.use({ hasTouch: true, timezoneId: 'Asia/Shanghai' });

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`运动弹窗触摸录入 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+08:00'));
    // 模拟微信运行时忽略 sv-SE，回退到 Mon Oct 19 2026 的日期格式。
    await page.addInitScript(() => {
      Date.prototype.toLocaleDateString = function () { return this.toDateString(); };
    });
    await setup(page);
    const typeId = '9223372036854775806';
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: String(1000 + index), exerciseTypeId: typeId,
      exerciseDate: '2026-10-01', exerciseCount: 20, description: '模拟运动记录',
    }));
    await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: {
      code: 0, data: { dictDetailList: [{ id: typeId, dictLabel: '跑步' }, { id: '82', dictLabel: '跳绳' }] },
    } }));
    await page.route('**/api/exerciseRecord/query?*', route => route.fulfill({ json: {
      code: 0, data: { items: rows, total: rows.length },
    } }));
    await page.route('**/api/exerciseRecord/statistics/summary?*', route => route.fulfill({ json: { code: 0, data: [{ exerciseTypeId: typeId, exerciseDate: '2026-10-01', exerciseCount: 400, recordCount: 20 }] } }));
    const writes = [];
    await page.route('**/api/exerciseRecord', async route => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: { code: 0, data: true } });
    });
    await page.goto('/#/pages/records/exercise');
    await expect(page.locator('.record-header')).toHaveCount(rows.length);
    // 在列表已滚动时打开，覆盖真实用户从列表底部新增的入口。
    // Scroll the actual page content, then verify opening the modal preserves its position.
    await page.locator('.mobile-page-scroll').hover();
    await page.waitForTimeout(220);
    await page.mouse.wheel(0, 100000);
    const scroll = page.locator('.mobile-page-scroll .uni-scroll-view').last();
    await page.getByRole('button', { name: '新增运动', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const date = dialog.locator('uni-picker[aria-label="运动日期"]');
    await expect(date.locator('.form-field-picker-value')).toHaveText('2026-10-19');
    await expect(page.locator('.mobile-page-scroll [role="dialog"]')).toHaveCount(0);
    const scrollTop = await scroll.evaluate(el => el.scrollTop);
    const count = dialog.getByRole('spinbutton', { name: '运动数量' });
    await count.tap();
    await expect(count).toBeFocused();
    await page.keyboard.type('30');
    const description = dialog.getByRole('textbox', { name: '备注' });
    await description.tap();
    await expect(description).toBeFocused();
    await page.keyboard.insertText('模拟触摸录入');
    if (width < 500) {
      await date.tap();
      await expect(page.locator('.uni-picker-content:visible')).toBeVisible();
      await page.locator('.uni-picker-action-confirm:visible').tap();
      await expect(page.locator('.uni-picker-content:visible')).toHaveCount(0);
    } else {
      await date.locator('input[type="date"]').fill('2026-10-19');
    }
    await expect(dialog).toBeVisible();
    expect(await scroll.evaluate(el => el.scrollTop)).toBe(scrollTop);
    await page.screenshot({ path: info.outputPath('exercise-entry.png') });
    await dialog.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ exerciseTypeId: typeId, exerciseDate: '2026-10-19', exerciseCount: 30, description: '模拟触摸录入' });
  });
}
