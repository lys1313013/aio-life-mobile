const { dismissModal } = require('./modal');
const { test, expect } = require('./support/test');
const { setup } = require('./qa-domains-fixtures');
const { selectCalendarDate } = require('./calendar');
test.use({ hasTouch: true, timezoneId: 'Asia/Shanghai' });

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`公共月历点选与取消 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00+08:00'));
    await setup(page);
    await page.goto('/#/pages/records/exercise');
    await page.getByRole('button', { name: '新增运动', exact: true }).tap();
    const editor = page.getByRole('dialog').first();
    const trigger = editor.getByRole('button', { name: '运动日期', exact: true });
    await expect(trigger).toContainText('2026-10-25');
    await trigger.tap();
    const calendar = page.getByRole('dialog', { name: '运动日期日历', exact: true });
    await expect(calendar.locator('.calendar-day')).toHaveCount(42);
    await expect(calendar.getByRole('button', { name: '2026-10-25', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const target = await calendar.getByRole('button', { name: '2026-10-26', exact: true }).boundingBox();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath('calendar.png') });
    await calendar.getByRole('button', { name: '下个月', exact: true }).tap();
    await dismissModal(page);
    await expect(trigger).toContainText('2026-10-25');
    await expect(editor).toBeVisible();
    await selectCalendarDate(page, trigger, '2024-02-29');
    await expect(trigger).toContainText('2024-02-29');
    await trigger.tap();
    await calendar.getByRole('button', { name: '2024-03-01', exact: true }).tap();
    await expect(trigger).toContainText('2024-03-01');
    await trigger.tap();
    await calendar.getByRole('button', { name: '今天', exact: true }).tap();
    await expect(trigger).toContainText('2026-10-25');
    await expect(editor).toBeVisible();
  });
}
