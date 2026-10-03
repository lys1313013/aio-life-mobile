const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');
// Drop held route handlers before the browser context teardown.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
});
async function scrollCommitsToBottom(page) {
  // 等待首屏各分区完成，避免触底事件被初始化中的分页保护拒绝。
  await expect(page.locator('.content-skeleton')).toHaveCount(0);
  const scroller = page.locator('.mobile-page-scroll .uni-scroll-view[style]').first();
  await page.locator('.mobile-page-scroll').hover();
  // uni-h5 的触底通知有 200ms 节流，初始布局完成后再发起真实滚动。
  await page.waitForTimeout(220);
  const bottom = await scroller.evaluate(el => el.scrollHeight - el.clientHeight);
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(bottom - 1);
}
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
async function fixture(page, hold = {}) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'loading-fixture'));
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (hold[path]) await hold[path].promise;
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/user/info') data = { id: '1', accountUsername: 'fixture', nickname: '模拟用户', roles: ['admin'] };
    if (path === '/api/userbinds/list') data = [{ platform: 'github', platformUsername: 'fixture', accessToken: 'fixture-token' }];
    if (path === '/api/github/recent-commits') data = Array.from({ length: 20 }, (_, n) => ({ id: String((Number(url.searchParams.get('page') || 1) - 1) * 20 + n), repo: 'fixture/mobile', message: '模拟提交 ' + n, date: '2026-10-02', actor: 'fixture' }));
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.route('https://api.github.com/**', async route => {
    const url = new URL(route.request().url());
    if (hold[url.pathname]) await hold[url.pathname].promise;
    if (url.pathname === '/graphql') {
      if (hold.failCalendar) return route.fulfill({ status: 503, json: { message: '模拟贡献服务暂不可用' } });
      return route.fulfill({ json: { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 1682, weeks: [{ contributionDays: [{ date: '2026-10-02', contributionCount: 3 }] }] } } } } } });
    }
    const data = url.pathname.includes('/users/') ? [{ id: '11', name: '模拟仓库', full_name: 'fixture/mobile', description: '模拟仓库描述', pushed_at: '2026-10-02', stargazers_count: 12, forks_count: 2, html_url: 'https://example.com' }] : [{ login: 'fixture', contributions: 128 }];
    await route.fulfill({ json: data });
  });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`GitHub skeleton responsive ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const hold = { '/graphql': gate(), '/users/fixture/repos': gate(), '/api/github/recent-commits': gate() };
    await fixture(page, hold);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/#/pages/coding/github');
    await expect(page.locator('.content-skeleton')).toHaveCount(3);
    await expect(page.locator('.metric-number')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '继续加载' })).toHaveCount(0);
    await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Verify actual motion, not merely the presence of an animation class.
    const skeleton = page.locator('.skeleton-content').first();
    expect(await skeleton.evaluate(el => getComputedStyle(el).animationName)).toContain('skeleton-breathe');
    const initialOpacity = await skeleton.evaluate(el => getComputedStyle(el).opacity);
    await expect.poll(() => skeleton.evaluate(el => getComputedStyle(el).opacity)).not.toBe(initialOpacity);
    await page.screenshot({ path: info.outputPath('github-loading.png'), fullPage: true });
    hold['/users/fixture/repos'].release();
    await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
    await expect(page.locator('.skeleton-calendar')).toBeVisible();
    hold['/api/github/recent-commits'].release(); hold['/graphql'].release();
    await expect(page.getByText('1682', { exact: true })).toBeVisible();
    await expect(page.locator('.content-skeleton')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
test('GitHub partial failure retries only failed section and keeps content', async ({ page }) => {
  const hold = { failCalendar: true };
  await fixture(page, hold); await page.goto('/#/pages/coding/github');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
  await expect(page.getByText('模拟提交 0', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-card').filter({ hasText: '过去一年提交' }).locator('.metric-number')).toHaveText('—');
  await expect(page.locator('.metric-card').filter({ hasText: '总 Star 数' }).locator('.metric-number')).toHaveText('12');
  hold.failCalendar = false; hold['/graphql'] = gate();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.skeleton-calendar')).toBeVisible();
  await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
  hold['/graphql'].release(); await expect(page.getByText('1682', { exact: true })).toBeVisible();
  const more = gate(); hold['/api/github/recent-commits'] = more;
  await scrollCommitsToBottom(page);
  await expect(page.getByRole('status', { name: '正在加载更多' })).toBeVisible();
  await expect(page.getByText('模拟提交 0', { exact: true })).toHaveCount(1);
  more.release(); await expect(page.getByText('模拟提交 0', { exact: true })).toHaveCount(2);
});
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`GitHub scroll pagination ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await fixture(page);
    const requests = [], pending = gate();
    await page.route('**/api/github/recent-commits?**', async route => {
      const number = Number(new URL(route.request().url()).searchParams.get('page'));
      requests.push(number);
      if (number === 2) await pending.promise;
      const data = Array.from({ length: number === 1 ? 20 : 3 }, (_, n) => ({
        id: `${number}-${n}`, repo: 'fixture/mobile',
        message: `第${number}页模拟提交 ${n}：完善移动端分页及加载状态`,
        date: '2026-10-02', actor: 'fixture',
      }));
      await route.fulfill({ json: { rscode: '0', data } });
    });
    await page.goto('/#/pages/coding/github');
    await expect(page.locator('.content-skeleton')).toHaveCount(0);
    await expect(page.locator('.repo-label')).toHaveCount(20);
    await expect(page.getByRole('button', { name: '继续加载' })).toHaveCount(0);
    expect(requests).toEqual([1]);
    await page.waitForLoadState('networkidle');
    await scrollCommitsToBottom(page);
    await expect(page.getByRole('status', { name: '正在加载更多' })).toBeVisible();
    // More gestures during the pending request must not fetch the same page twice.
    await page.mouse.wheel(0, -300);
    await scrollCommitsToBottom(page);
    await page.screenshot({ path: info.outputPath('github-pagination-loading.png') });
    expect(requests).toEqual([1, 2]);
    pending.release();
    await expect(page.locator('.repo-label')).toHaveCount(23);
    await scrollCommitsToBottom(page);
    await expect(page.getByRole('status', { name: '正在加载更多' })).toHaveCount(0);
    await expect(page.getByText('第2页模拟提交 2：完善移动端分页及加载状态', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('github-pagination-end.png') });
    expect(requests).toEqual([1, 2]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('GitHub pagination failure retains commits and retries the failed page', async ({ page }) => {
  await fixture(page);
  const requests = [];
  let fail = true;
  await page.route('**/api/github/recent-commits?**', async route => {
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    requests.push(number);
    if (number === 2 && fail) return route.fulfill({ json: { rscode: '1', result: '模拟分页失败' } });
    const data = Array.from({ length: number === 1 ? 20 : 1 }, (_, n) => ({ id: `${number}-${n}`, repo: 'fixture/mobile', message: `分页${number}提交${n}`, date: '2026-10-02', actor: 'fixture' }));
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/#/pages/coding/github');
  await expect(page.locator('.content-skeleton')).toHaveCount(0);
  await expect(page.locator('.repo-label')).toHaveCount(20);
  await scrollCommitsToBottom(page);
  await expect.poll(() => requests).toEqual([1, 2]);
  await expect(page.getByText('模拟分页失败', { exact: true })).toBeVisible();
  await expect(page.locator('.repo-label')).toHaveCount(20);
  fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.repo-label')).toHaveCount(21);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toEqual([1, 2, 2]);
});
const scenarios = [
  ['records/library?kind=read', '.library-poster .skeleton-cover'],
  ['tasks/goals', '.goal-grid .skeleton-tile'],
  ['goods/wardrobe', '.item-photo .skeleton-cover'],
  ['profile/settings', '.skeleton-input'],
  ['profile/index', '.skeleton-avatar'],
  ['time/index', '.timeline[aria-busy="true"]'],
];
// Every request after authentication is held so each route's first-frame loading
// layout is checked independently of endpoint ordering.
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) test(`page-specific placeholders ${width} ${theme}`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'loading-fixture'));
  for (const [route, selector] of scenarios) {
    const pending = gate();
    await page.route('http://127.0.0.1:5180/api/**', async request => {
      const path = new URL(request.request().url()).pathname;
      if (path === '/api/user/info' && !['profile/settings', 'profile/index'].includes(route)) return request.fulfill({ json: { rscode: '0', data: { id: '1', nickname: '模拟用户', roles: ['admin'] } } });
      await pending.promise;
      await request.fulfill({ json: { rscode: '0', data: [] } });
    });
    await page.goto('/#/pages/' + route); await page.reload();
    await expect(page.locator(selector).first()).toBeVisible();
    await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(route.replace(/[/?=]/g, '-') + '.png'), fullPage: true });
    pending.release();
  }
});


for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`refresh retains metrics through failure and retry ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const hold = {}; await fixture(page, hold); await page.goto('/#/pages/coding/github');
    await expect(page.getByText('1682', { exact: true })).toBeVisible();
    await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
    hold['/graphql'] = gate(); hold['/users/fixture/repos'] = gate(); hold['/api/github/recent-commits'] = gate();
    await require('./gestures').pullDown(page, '.mobile-page-scroll');
    await expect(page.getByRole('status', { name: '正在更新内容' })).toHaveCount(3);
    await expect(page.getByText('1682', { exact: true })).toBeVisible();
    await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
    await expect(page.locator('.content-skeleton')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('github-refresh.png') });
    hold['/graphql'].release(); hold['/users/fixture/repos'].release(); hold['/api/github/recent-commits'].release();
    await expect(page.getByRole('status', { name: '正在更新内容' })).toHaveCount(0);
    hold.failCalendar = true;
    await require('./gestures').pullDown(page, '.mobile-page-scroll');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('1682', { exact: true })).toBeVisible();
    await expect(page.locator('.uni-scroll-view-refresher').last()).toHaveCSS('height', '0px');
    hold.failCalendar = false; hold['/graphql'] = gate();
    await page.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('status', { name: '正在更新内容' })).toHaveCount(1);
    await expect(page.getByText('1682', { exact: true })).toBeVisible();
    hold['/graphql'].release();
    await expect(page.getByRole('status', { name: '正在更新内容' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    hold['/graphql'] = gate(); await page.reload();
    await expect(page.locator('.skeleton-calendar')).toBeVisible();
    expect(await page.locator('.skeleton-content').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    hold['/graphql'].release();
  });
}

test('a failed GitHub section can retry while another section is still pending', async ({ page }) => {
  const hold = { failCalendar: true, '/users/fixture/repos': gate() }; await fixture(page, hold);
  await page.goto('/#/pages/coding/github'); await expect(page.getByRole('alert')).toBeVisible();
  hold.failCalendar = false; hold['/graphql'] = gate();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.skeleton-calendar')).toBeVisible();
  hold['/users/fixture/repos'].release(); await expect(page.getByText('模拟仓库', { exact: true })).toBeVisible();
  await expect(page.locator('.skeleton-calendar')).toBeVisible();
  hold['/graphql'].release(); await expect(page.getByText('1682', { exact: true })).toBeVisible();
});

test('all asynchronous business pages expose loading placeholders', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 900 }); await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'loading-fixture'));
  const routes = ['home/index', 'life/index', 'time/dashboard', 'time/edit', 'profile/bindings', 'profile/preferences?section=menus', 'profile/security', 'profile/notifications', 'categories/index', 'admin/index', 'admin/directory', 'finance/index', 'finance/cards', 'finance/income', 'finance/expense', 'finance/import', 'goods/devices', 'member/index', 'mcp/index', 'messages/index', 'coding/csdn', 'coding/leetcode', 'tasks/todo', 'records/notes', 'records/feedback', 'records/anniversary', 'records/milestones', 'records/honor', 'records/activity', 'records/exercise', 'records/categories', 'records/video', 'records/weread', 'relationship/index', 'personality/mbti', 'personality/cbti', 'vault/index'];
  for (const route of routes) {
    const pending = gate();
    await page.route('http://127.0.0.1:5180/api/**', async request => {
      const path = new URL(request.request().url()).pathname;
      if (path === '/api/user/info') return request.fulfill({ json: { rscode: '0', data: { id: '1', nickname: '模拟用户', roles: ['admin'] } } });
      await pending.promise; await request.fulfill({ json: { rscode: '0', data: [] } });
    });
    try {
      await page.goto('/#/pages/' + route); await page.reload();
      const loadingSelector = route === 'finance/cards' ? '.card-loading' : route === 'relationship/index' ? '.topology .loading-indicator' : route === 'time/edit' ? '.editor-loading .loading-indicator' : '.content-skeleton';
      await expect(page.locator(loadingSelector).first(), route).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
      await page.screenshot({ path: info.outputPath(route.replace(/[/?=]/g, '-') + '.png') });
    } finally { pending.release();  }
  }
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`time refresh keeps content stationary ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const firstLoad = gate();
    const hold = { '/api/timeRecord/query': firstLoad };
    await fixture(page, hold);
    await page.goto('/#/pages/time/index');
    await expect(page.getByRole('status', { name: '正在加载时迹', exact: true })).toBeVisible();
    const initial = await page.locator('.timeline').boundingBox();
    firstLoad.release();
    await expect(page.locator('.timeline-event')).toHaveCount(2);
    expect(await page.locator('.timeline').boundingBox()).toEqual(initial);

    for (const view of ['时间轴视图', '卡片视图']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const panel = page.locator('.time-main-panel');
      const before = await panel.boundingBox();
      const pending = gate();
      hold['/api/timeRecord/query'] = pending;
      await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
      await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
      await expect(page.getByRole('status', { name: '正在更新时迹', exact: true })).toBeVisible();
      expect(await panel.boundingBox()).toEqual(before);
      await expect(page.locator(view === '时间轴视图' ? '.timeline-event' : '.record-card')).toHaveCount(2);
      await page.screenshot({ path: info.outputPath(view === '时间轴视图' ? 'timeline-refresh.png' : 'cards-refresh.png') });
      pending.release();
      await expect(page.getByRole('status', { name: '正在更新时迹', exact: true })).toHaveCount(0);
      expect(await panel.boundingBox()).toEqual(before);
    }
  });
}

for (const width of [390, 768, 1440]) test(`time loading preserves real day week month and card layout ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: width === 768 ? 'light' : 'dark' });
  const pending = gate();
  await fixture(page, { '/api/timeRecord/query': pending, '/api/timeRecord/queryByDateRange': pending });
  await page.goto('/#/pages/time/index');
  await expect(page.locator('.timeline[aria-busy="true"]')).toBeVisible();
  await expect(page.locator('.timeline-column')).toHaveCount(1);
  await expect(page.locator('.column-heading')).toBeDisabled();
  await expect(page.locator('.skeleton-timeline-row')).toHaveCount(0);
  const initial = await page.locator('.timeline').boundingBox();
  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.locator('.timeline-column')).toHaveCount(7);
  await page.getByRole('button', { name: '月视图', exact: true }).click();
  expect(await page.locator('.timeline-column').count()).toBeGreaterThanOrEqual(28);
  expect((await page.locator('.timeline').boundingBox()).height).toBe(initial.height);
  await page.screenshot({ path: info.outputPath('time-month-loading.png') });
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await expect(page.locator('.record-card-cell')).toHaveCount(6);
  await expect(page.locator('.timeline')).toHaveCount(0);
  await page.getByRole('button', { name: '时间轴视图', exact: true }).click();
  pending.release();
  await expect(page.getByRole('status', { name: '正在加载时迹', exact: true })).toHaveCount(0);
  expect((await page.locator('.timeline').boundingBox()).height).toBe(initial.height);
  await page.getByRole('button', { name: '日视图', exact: true }).click();
  await expect(page.locator('.timeline-event')).toHaveCount(2);
  await page.getByRole('button', { name: '卡片视图', exact: true }).click();
  await expect(page.locator('.record-card')).toHaveCount(2);
  await expect(page.locator('.record-card .content-skeleton')).toHaveCount(0);
});

for (const width of [390, 768, 1440]) test(`loading matches page grids and cover proportions ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'loading-fixture'));
  const pending = gate();
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    if (new URL(route.request().url()).pathname !== '/api/user/info') await pending.promise;
    await route.fulfill({ json: { rscode: '0', data: { id: '1', nickname: '模拟用户' } } });
  });
  const entries = [
    ['records/library?kind=read', '.library-card', '.library-poster', width < 768 ? 3 : width < 1200 ? 5 : 7, 4 / 3],
    ['records/video', '.video-card', '.video-poster', width < 600 ? 2 : width < 1000 ? 3 : 4, 0.625],
    ['tasks/goals', '.goal-grid .record-card', null, width < 600 ? 2 : width < 960 ? 3 : 4],
    ['goods/devices', '.goods-card', '.goods-media', width < 700 ? 2 : width < 1000 ? 3 : 4],
  ];
  for (const [route, card, cover, columns, ratio] of entries) {
    await page.goto('/#/pages/' + route); await page.reload();
    await expect(page.locator(card).first()).toBeVisible();
    const boxes = await page.locator(card).evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { top: b.top, width: b.width }; }));
    expect(boxes.filter(b => Math.abs(b.top - boxes[0].top) < 1)).toHaveLength(columns);
    if (cover) {
      const b = await page.locator(cover).first().boundingBox();
      expect(b.height).toBeGreaterThan(0);
      if (ratio) expect(b.height / b.width).toBeCloseTo(ratio, 1);
    }
  }
  pending.release();
});
