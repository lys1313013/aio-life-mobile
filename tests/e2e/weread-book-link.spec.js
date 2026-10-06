const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const fs = require('node:fs');
const link = 'https://weread.qq.com/web/reader/mock-book';
const cover = 'https://weread.qq.com/mock-cover.svg';
const coverSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="84"><rect width="60" height="84" fill="#cfab6f"/></svg>';
async function setup(page, context) {
  const state = { calls: [], fail: false, invalid: false };
  await context.route('https://weread.qq.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>模拟微信读书</h1>' }));
  await context.route(cover, route => route.fulfill({ contentType: 'image/svg+xml', body: coverSvg }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/auth/login') data = { accessToken: 'weread-fixture' };
    if (path === '/api/user/info') data = { id: '6', nickname: '模拟用户', accountUsername: 'fixture' };
    if (path === '/api/weread/connection') data = { connected: true };
    if (path === '/api/weread/sync') data = {
      shelf: { books: [] }, notebooks: { books: [] }, lastSyncTime: '2026-10-02',
      stats: { totalReadTime: 3600, readDays: 2, readLongest: [
        { book: { bookId: 'direct', title: '模拟直接打开书籍', deepLink: link, cover }, readTime: 2400 },
        { book: { bookId: '3300144307', title: '模拟缺少链接的书籍：较长书名用于验证平板和手机的换行与点击区域', cover }, readTime: 1200 },
        { albumInfo: { name: '模拟无书籍标识的有声内容' }, readTime: 600 },
      ] },
    };
    if (path === '/api/weread/book-link') {
      state.calls.push(url.searchParams.get('bookId'));
      await new Promise(resolve => setTimeout(resolve, 250));
      if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟查询失败，请重试' } });
      data = { deepLink: state.invalid ? 'javascript:alert(1)' : link };
    }
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.goto('/#/pages/records/weread');
  await expect(page.getByText('阅读最多的书', { exact: true })).toBeVisible();
  return state;
}
for (const width of [390, 768, 1440]) for (const dark of [false, true]) {
  test(`阅读排行跳转 ${width} ${dark ? 'dark' : 'light'}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    const state = await setup(page, context);
    const direct = page.getByRole('button', { name: '在微信读书打开：模拟直接打开书籍', exact: true });
    const pending = page.getByRole('button', { name: /^在微信读书打开：模拟缺少/ });
    fs.mkdirSync('artifacts/weread-links', { recursive: true });
    await page.screenshot({ path: `artifacts/weread-links/${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const directPopup = page.waitForEvent('popup'); await direct.click();
    const opened = await directPopup; await opened.waitForURL(link);
    expect(await opened.evaluate(() => window.opener === null)).toBe(true);
    expect(state.calls).toEqual([]); await opened.close();
    const pendingPopup = page.waitForEvent('popup'); await pending.press('Enter');
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await pending.click(); // 加载中重复点击不重复请求。
    const resolved = await pendingPopup; await resolved.waitForURL(link);
    expect(await resolved.evaluate(() => window.opener === null)).toBe(true);
    expect(state.calls).toEqual(['3300144307']);
    await expect(pending).toHaveAttribute('aria-busy', 'false'); await resolved.close();
    const cachedPopup = page.waitForEvent('popup'); await pending.click();
    const cached = await cachedPopup; await cached.waitForURL(link); await cached.close();
    expect(state.calls).toHaveLength(1);
    expect(await page.locator('.rank-row').last().getAttribute('role')).toBeNull();
  });
}
test('失败关闭空白页并可重试，不接受无效链接', async ({ page, context }) => {
  const state = await setup(page, context);
  const row = page.getByRole('button', { name: /^在微信读书打开：模拟缺少/ });
  state.fail = true;
  let opened = page.waitForEvent('popup'); await row.click();
  const failed = await opened;
  await expect(row.getByRole('alert')).toContainText('模拟查询失败');
  await expect.poll(() => failed.isClosed()).toBe(true);
  state.fail = false; state.invalid = true;
  opened = page.waitForEvent('popup'); await row.click();
  const invalid = await opened;
  await expect(row.getByRole('alert')).toContainText('暂无可用链接');
  await expect.poll(() => invalid.isClosed()).toBe(true);
  state.invalid = false;
  opened = page.waitForEvent('popup'); await row.click();
  const retried = await opened; await retried.waitForURL(link); await retried.close();
  expect(state.calls).toHaveLength(3);
});
test('拦截弹窗后可再次点击打开', async ({ page, context }) => {
  const state = await setup(page, context);
  await page.evaluate(() => { window.originalOpen = window.open; window.open = () => null; });
  const row = page.getByRole('button', { name: /^在微信读书打开：模拟缺少/ });
  await row.click();
  await expect(row.getByRole('alert')).toContainText('再次点击');
  await page.evaluate(() => { window.open = window.originalOpen; });
  const opened = page.waitForEvent('popup'); await row.click();
  const retried = await opened; await retried.waitForURL(link); await retried.close();
  expect(state.calls).toHaveLength(1);
});

test('离页后关闭空白窗口，迟到的链接不触发跳转', async ({ page, context }) => {
  await setup(page, context);
  let finish;
  await page.route('**/api/weread/book-link?**', async route => {
    await new Promise(resolve => { finish = resolve; });
    await route.fulfill({ json: { code: 0, data: { deepLink: link } } });
  });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^在微信读书打开：模拟缺少/ }).click();
  const opened = await popup;
  await expect.poll(() => !!finish).toBe(true);
  await page.goto('/#/pages/home/index');
  finish();
  await expect.poll(() => opened.isClosed()).toBe(true);
});
