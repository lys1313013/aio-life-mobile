const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');

async function setup(page) {
  const state = { calls: {}, fail: false, release: null, pending: null };
  await page.addInitScript(() => {
    window.openedLinks = [];
    window.open = url => { window.openedLinks.push(url); return null; };
  });
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/auth/login') data = { accessToken: 'overview-fixture' };
    if (path === '/api/user/info') data = { id: '1', nickname: '模拟用户' };
    if (path.startsWith('/api/dashboard/card/')) {
      const type = path.split('/').pop();
      state.calls[type] = (state.calls[type] || 0) + 1;
      if (state.pending) await state.pending;
      if (state.fail) return route.fulfill({ json: { rscode: '1', result: '模拟刷新失败' } });
      const destinations = {
        GITHUB: ['https://github.com/example', 'https://github.com/example?tab=repositories'],
        SHANBAY: ['https://web.shanbay.com/web/users/example/checkin', 'https://web.shanbay.com/web/users/example/checkin'],
        EXERCISE: ['/record/exercise', 'action:open-exercise-modal'],
      };
      if (destinations[type]) [data.iconClickUrl, data.titleClickUrl] = destinations[type];
    }
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('test');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新GitHub', exact: true })).toBeVisible();
  await expect(page.locator('.overview-card .card-progress')).toHaveCount(0);
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`overview separates refresh, icon and title ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    const homeUrl = page.url();
    for (const [title, type] of [['GitHub', 'GITHUB'], ['扇贝单词', 'SHANBAY']]) {
      const card = page.getByRole('button', { name: '刷新' + title, exact: true });
      const before = { ...state.calls };
      await card.locator('.stat-value').click();
      await expect.poll(() => state.calls[type]).toBe(before[type] + 1);
      await expect(card.locator('.card-progress')).toHaveCount(0);
      expect(state.calls).toEqual({ ...before, [type]: before[type] + 1 });
      await expect(page).toHaveURL(homeUrl);
      expect(await page.evaluate(() => window.openedLinks)).toEqual([]);
    }
    const beforeLinks = { ...state.calls };
    await page.getByRole('button', { name: 'GitHub图标', exact: true }).click();
    await page.getByRole('button', { name: 'GitHub标题', exact: true }).click();
    await page.getByRole('button', { name: '扇贝单词标题', exact: true }).click();
    expect(await page.evaluate(() => window.openedLinks)).toEqual([
      'https://github.com/example', 'https://github.com/example?tab=repositories',
      'https://web.shanbay.com/web/users/example/checkin',
    ]);
    expect(state.calls).toEqual(beforeLinks);
    // 没有链接的标题也只刷新，不能凭卡片类型跳转。
    await page.getByRole('button', { name: '每日一题标题', exact: true }).click();
    await expect.poll(() => state.calls.LEETCODE).toBe(beforeLinks.LEETCODE + 1);
    await expect(page).toHaveURL(homeUrl);
    for (const button of await page.locator('.stat-link').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath('overview.png') });
    await page.getByRole('button', { name: '今日运动标题', exact: true }).click();
    await expect(page).toHaveURL(/pages\/records\/exercise$/);
  });
}

test('overview refresh preserves values, rejects duplicate requests and recovers from failure', async ({ page }) => {
  const state = await setup(page);
  const card = page.locator('.overview-card').filter({ has: page.locator('.stat-title').getByText('GitHub', { exact: true }) });
  const value = await card.locator('.stat-value').textContent();
  const before = state.calls.GITHUB;
  state.pending = new Promise(resolve => { state.release = resolve; });
  try {
    await card.locator('.stat-value').click();
    await expect(card.locator('.card-progress')).toBeVisible();
    await card.locator('.stat-value').click();
    expect(state.calls.GITHUB).toBe(before + 1);
    await expect(card.locator('.stat-value')).toHaveText(value);
    state.fail = true;
  } finally { state.release(); }
  await expect(card).toHaveAttribute('aria-label', '重试GitHub');
  await expect(card.locator('.stat-value')).toHaveText(value);
  state.pending = null;
  state.fail = false;
  await card.locator('.stat-bottom').click();
  await expect(card).toHaveAttribute('aria-label', '刷新GitHub');
  expect(state.calls.GITHUB).toBe(before + 2);
  expect(await page.evaluate(() => window.openedLinks)).toEqual([]);
});
