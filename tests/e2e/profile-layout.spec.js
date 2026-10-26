const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`资料区首次加载与长签名刷新保持布局 ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    const now = new Date();
    await page.clock.setFixedTime(now);
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'profile-layout-fixture'));
    const profile = { id: '9223372036854775807', nickname: '模拟用户', introduction: '', avatarFileId: null };
    let release;
    let pending = new Promise(resolve => { release = resolve; });
    let reads = 0;
    await page.route(new URL('/api/**', test.info().project.use.baseURL).href, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/user/info') {
        reads++;
        if (pending) await pending;
        return route.fulfill({ json: { code: 0, data: profile } });
      }
      return route.fulfill({ json: { code: 0, data: dashboardFixture(path) ?? [] } });
    });
    await page.goto('/#/pages/profile/index');
    await expect(page.getByRole('status', { name: '正在加载个人资料' })).toBeVisible();
    const skeletonMenu = await page.locator('.profile-menu').first().boundingBox();
    pending = null;
    release();
    await expect(page.getByRole('button', { name: '编辑资料', exact: true })).toBeVisible();
    await expect(page.locator('.profile-intro')).toHaveCount(0);
    const settledMenu = await page.locator('.profile-menu').first().boundingBox();
    expect(Math.abs(settledMenu.y - skeletonMenu.y)).toBeLessThanOrEqual(1);

    profile.introduction = '这是一段较长的模拟个性签名，用于检查窄屏换行、头像对齐和资料区域的自然高度。'.repeat(3);
    await page.locator('.profile-avatar').click();
    await expect(page.locator('[aria-label="签名"] textarea')).toHaveValue(profile.introduction);
    await page.clock.setFixedTime(new Date(now.getTime() + 61 * 60 * 1000));
    const previousReads = reads;
    pending = new Promise(resolve => { release = resolve; });
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect.poll(() => reads).toBeGreaterThan(previousReads);
    await expect(page.locator('.profile-intro')).toHaveText(profile.introduction);
    const refreshingMenu = await page.locator('.profile-menu').first().boundingBox();
    await expect(page.getByRole('status', { name: '正在加载个人资料' })).toHaveCount(0);
    pending = null;
    const finished = page.waitForResponse(response => new URL(response.url()).pathname === '/api/user/info');
    release();
    await finished;
    const refreshedMenu = await page.locator('.profile-menu').first().boundingBox();
    expect(Math.abs(refreshedMenu.y - refreshingMenu.y)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/profile-long-${width}-${colorScheme}.png`, fullPage: true });
  });
}
