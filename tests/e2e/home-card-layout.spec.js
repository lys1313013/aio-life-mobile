const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');
const { pullDown } = require('./gestures');
const businessPaths = ['/api/goals', '/api/anniversaryRecords', '/api/read-record/page', '/api/membership/list', '/api/movie/page'];
const titles = ['目标', '纪念日', '阅读', '会员', '观影'];
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
async function geometry(page) {
  return page.locator('.business-card').evaluateAll(elements => Object.fromEntries(elements.map(el => [el.getAttribute('aria-label'), { height: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top }])));
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`所有业务卡片加载、刷新和失败重试保持行高 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'layout-fixture'));
    const state = { pending: gate(), fail: false, count: 1 };
    const fixtures = {
      '/api/user/info': { id: '1', nickname: '模拟用户' },
      '/api/quick-nav/candidates': ['/task-center/goal', '/my-hub/anniversary', '/my-hub/read-record', '/membership', '/my-hub/movie'].map(path => ({ path })),
      '/api/menu/all': [],
      '/api/goals': [{ id: '1', title: '模拟目标', status: 'in_progress', isPinned: 1, targetValue: 10, currentValue: 2 }],
      '/api/anniversaryRecords': [{ id: '1', title: '模拟纪念日', targetDate: '2026-12-01', isPinned: 1 }],
      '/api/read-record/page': { items: [{ id: '1', title: '模拟阅读', status: 'in_progress' }], total: 1 },
      '/api/membership/list': [{ id: '1', name: '模拟会员', status: 'active', expiryDate: '2099-01-01' }],
      '/api/movie/page': { items: [{ id: '1', title: '模拟观影', status: 'not_started' }], total: 1 },
    };
    await page.route(`${info.project.use.baseURL}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (businessPaths.includes(path)) {
        await state.pending.promise;
        if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟刷新失败' } });
      }
      let data = fixtures[path] ?? dashboardFixture(path) ?? [];
      if (businessPaths.includes(path)) {
        const rows = Array.isArray(data) ? data : data.items;
        const expanded = Array.from({ length: state.count }, (_, index) => ({ ...rows[0], id: String(index + 1), ...(state.count > 1 ? { title: '模拟长标题用于验证换行后的高度和后续卡片位置 ' + index, name: '模拟长名称用于验证换行后的高度 ' + index } : {}) }));
        data = Array.isArray(data) ? expanded : { items: expanded, total: expanded.length };
      }
      return route.fulfill({ json: { code: 0, data } });
    });
    try {
      await page.goto('/#/pages/home/index');
      await expect(page.locator('.business-skeleton')).toHaveCount(4);
      await expect(page.locator('.reading-placeholder')).toHaveCount(3);
      await page.locator('[aria-label="目标首页卡片"]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      const before = await geometry(page);
      await page.screenshot({ path: info.outputPath('loading.png'), fullPage: true });
      state.pending.release();
      await expect(page.locator('.business-skeleton, .reading-placeholder')).toHaveCount(0);
      await expect(page.locator('.business-card')).toHaveCount(5);
      expect(await geometry(page)).toEqual(before);
      await page.locator('[aria-label="目标首页卡片"]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: info.outputPath('single-row.png'), fullPage: true });
      const loaded = await geometry(page);
      state.pending = gate();
      await pullDown(page, '.dashboard-scroll');
      await expect(page.locator('.business-card[aria-busy="true"]')).toHaveCount(5);
      await expect(page.locator('.business-skeleton, .reading-placeholder')).toHaveCount(0);
      const refreshing = await geometry(page);
      for (const title of titles) expect(refreshing[title + '首页卡片'].height).toBe(loaded[title + '首页卡片'].height);
      state.fail = true;
      state.pending.release();
      await expect(page.locator('.business-card[aria-busy="true"]')).toHaveCount(0);
      const failed = await geometry(page);
      for (const title of titles) expect(failed[title + '首页卡片'].height).toBe(loaded[title + '首页卡片'].height);
      state.fail = false; state.count = 8;
      await pullDown(page, '.dashboard-scroll');
      await expect(page.locator('.business-row')).toHaveCount(32);
      await expect(page.locator('.reading-book')).toHaveCount(8);
      const many = await geometry(page);
      await page.locator('[aria-label="目标首页卡片"]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: info.outputPath('many.png'), fullPage: true });
      for (const title of titles) expect(many[title + '首页卡片'].height).toBeLessThanOrEqual(280);
      state.pending = gate();
      await pullDown(page, '.dashboard-scroll');
      await expect(page.locator('.business-card[aria-busy="true"]')).toHaveCount(5);
      const pendingMany = await geometry(page);
      for (const title of titles) expect(pendingMany[title + '首页卡片'].height).toBe(many[title + '首页卡片'].height);
      state.pending.release();
      await expect(page.locator('.business-card[aria-busy="true"]')).toHaveCount(0);
      state.count = 0;
      await pullDown(page, '.dashboard-scroll');
      await expect(page.locator('.business-card')).toHaveCount(0);
    } finally { state.pending.release(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}

for (const count of [1, 5]) {
  test(`概览占位按启用数量生成且高度一致 ${count}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'overview-layout-fixture'));
    const pending = gate();
    const { homeCardFixture } = require('./home-card-fixture');
    const preferences = homeCardFixture().map((item, index) => ({ ...item, enabled: index < count }));
    const tasks = preferences.filter(item => item.enabled).map(item => ({ type: item.cardKey.slice(9).toUpperCase(), title: item.title }));
    await page.route(`${info.project.use.baseURL}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path === '/api/user/info') data = { id: '1', nickname: '模拟用户' };
      if (path === '/api/home/cards') data = preferences;
      if (path === '/api/dashboard/tasks') { await pending.promise; data = tasks; }
      if (path.startsWith('/api/dashboard/card/')) data = { ...tasks.find(item => path.endsWith(item.type)), value: '3', totalValue: '5', refreshInterval: 0 };
      return route.fulfill({ json: { code: 0, data } });
    });
    try {
      await page.goto('/#/pages/home/index');
      await expect(page.locator('.placeholder-card')).toHaveCount(count);
      const before = (await page.locator('.overview-grid').boundingBox()).height;
      pending.release();
      await expect(page.locator('.placeholder-card')).toHaveCount(0);
      await expect(page.locator('.overview-card')).toHaveCount(count);
      expect((await page.locator('.overview-grid').boundingBox()).height).toBe(before);
    } finally { pending.release(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}
