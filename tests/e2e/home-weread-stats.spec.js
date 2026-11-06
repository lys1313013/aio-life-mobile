const path = require('node:path');
const fs = require('node:fs');
const { test, expect } = require('./support/test');

function weekFixture(overrides = {}) {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const seconds = [2100, 1800, 0, 900, 1200, 600, 2400];
  return {
    connected: true,
    granularity: 'week',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    elapsedDays: 5,
    buckets: labels.map((label, index) => ({
      key: '2026-11-0' + (index + 2),
      label,
      seconds: seconds[index],
    })),
    totalSeconds: seconds.reduce((sum, value) => sum + value, 0),
    dailyAverageSeconds: 1800,
    previousPeriodStart: '2026-10-26',
    previousPeriodEnd: '2026-10-30',
    previousTotalSeconds: 7200,
    refreshInterval: 600,
    ...overrides,
  };
}

function monthFixture() {
  const buckets = Array.from({ length: 30 }, (_, index) => ({
    key: '2026-11-' + String(index + 1).padStart(2, '0'),
    label: String(index + 1),
    seconds: index % 3 === 0 ? 1200 : 0,
  }));
  return weekFixture({
    granularity: 'month',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    elapsedDays: 6,
    buckets,
    totalSeconds: 12000,
    dailyAverageSeconds: 2000,
  });
}

function handlers(state) {
  const data = {
    '/api/home/cards': [{ cardKey: 'section.weread-stats', title: '阅读统计', icon: 'lucide:book-open', iconColor: '#3FB27F', group: 'section', isEnabled: 1, sortOrder: 0 }],
    '/api/user/info': { id: '1', nickname: '模拟用户' },
    '/api/menu/visuals': { menus: [], cards: { 'section.weread-stats': { menuId: 'weread-menu', icon: 'lucide:book-open', iconColor: '#3FB27F' } } },
    '/api/auth/secondary-lock/menus': [],
    '/api/menu/all': [],
    '/api/quick-nav/candidates': [],
    '/api/quick-nav/my': [],
    '/api/thought/dashboard': [],
    '/api/taskDetails/watched': [],
    '/api/dashboard/tasks': [],
  };
  return {
    ...Object.fromEntries(Object.entries(data).map(([path, value]) => ['GET ' + path, { json: { code: 0, message: null, data: value } }])),
    'GET /api/home/sections/weread-stats': async request => {
      state.calls.push(new URL(request.url()).search);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.fail) return { json: { code: 1, message: '模拟阅读统计失败' } };
      const granularity = new URL(request.url()).searchParams.get('granularity');
      return { json: { code: 0, message: null, data: granularity === 'month' ? monthFixture() : weekFixture({ connected: state.connected }) } };
    },
  };
}

async function setup(page, apiMock, { delay = 0, fail = false } = {}) {
  const state = { delay, fail, connected: true, calls: [] };
  apiMock(handlers(state));
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'stats-fixture'));
  return { state, calls: () => state.calls, recover: () => { state.fail = false; }, setConnected: value => { state.connected = value; } };
}

function card(page) {
  return page.locator('[data-card-key="section.weread-stats"]');
}

for (const width of [390, 820, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`阅读统计卡片加载、切换与高度稳定 ${width} ${theme}`, async ({ page, apiMock }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme });
      const fixture = await setup(page, apiMock, { delay: 600 });
      await page.goto('/#/pages/home/index');
      const target = card(page);
      await expect(target).toBeVisible();
      const cardBody = target.locator('.dashboard-section');
      const loadingBox = await cardBody.boundingBox();
      await page.screenshot({ path: info.outputPath('stats-loading.png'), fullPage: true });

      await expect(target).toContainText('本周');
      await expect(target).toContainText('2 小时 30 分');
      await expect(target).toContainText('日均 30 分钟');
      await expect(target).toContainText('+25%');
      await expect(target.locator('.weread-stats-bar-hit')).toHaveCount(7);
      const loadedBox = await cardBody.boundingBox();
      expect(Math.abs(loadingBox.height - loadedBox.height)).toBeLessThanOrEqual(6);
      expect(loadedBox.height).toBeLessThanOrEqual(width >= 1024 ? 280 : width >= 640 ? 250 : 240);

      await target.getByRole('button', { name: '按周统计' }).click();
      await expect(target.locator('.weread-stats-bar-hit')).toHaveCount(7);
      await target.locator('.weread-stats-bar-hit').nth(1).click();
      await expect(target).toContainText('11月3日');
      await page.screenshot({ path: info.outputPath('stats-light.png'), fullPage: true });

      await target.getByRole('button', { name: '按月统计' }).click();
      await expect(target).toContainText('本月');
      await expect(target.locator('.weread-stats-bar-hit')).toHaveCount(30);
      expect(fixture.calls().some(call => call.includes('granularity=month'))).toBe(true);
      await page.screenshot({ path: info.outputPath('stats-month.png'), fullPage: true });

      const folder = path.resolve('artifacts/home-weread-stats');
      fs.mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: path.join(folder, `stats-${width}-${theme}.png`), fullPage: true });
      expect(await target.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    });
  }
}

test('阅读统计失败可局部重试且未连接时隐藏', async ({ page, apiMock }) => {
  const fixture = await setup(page, apiMock, { fail: true });
  await page.goto('/#/pages/home/index');
  const target = card(page);
  await expect(target).toContainText('模拟阅读统计失败');
  fixture.recover();
  await target.getByRole('button', { name: '刷新阅读统计' }).click();
  await expect(target).toContainText('本周');
  const hidden = await setup(page, apiMock, { fail: false });
  hidden.setConnected(false);
  await page.reload();
  await expect(card(page)).toHaveCount(0);
});
