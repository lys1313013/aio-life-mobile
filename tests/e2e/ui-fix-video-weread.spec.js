const { test, expect } = require('./support/test');
const { setup } = require('./qa-records-fixtures.js');

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`视频时分秒输入与固定操作 ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const state = await setup(page);
    await page.goto('/#/pages/records/video?create=1');
    const dialog = page.getByRole('dialog', { name: '编辑学习视频' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '播放视频', exact: true })).toHaveCount(0);
    await page.locator('input[aria-label="视频链接"]').fill('https://www.bilibili.com/video/BV1234567890');
    await expect(dialog.getByRole('button', { name: '播放视频', exact: true })).toBeVisible();
    await page.locator('input[aria-label="标题"]').fill('模拟时分秒课程');
    await page.locator('input[aria-label="已学习时长"]').fill('00:60:00');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('时长请用');
    expect(state.writes).toHaveLength(0);
    await page.locator('input[aria-label="总时长"]').fill('01:20:00');
    await page.locator('input[aria-label="已学习时长"]').fill('00:01:20');
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    await page.screenshot({ path: `artifacts/ui-fixes-2026-10-25/video-${width}-${colorScheme}.png` });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.find(write => write.path === '/api/b-video').body).toMatchObject({ duration: 4800, watchedDuration: 80 });
  });
}
