const { test, expect } = require('./support/test');
const { stableBox } = require('./support/geometry');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');
const { section } = require('../../src/styles/spacing.json');

const minutes = [3, 6, 8, 8, 0, 9, 26];
// 同一瞬间在 UTC 是周日、上海是周一；fixture 必须对应浏览器选中的本地日期。
for (const [timezoneId, mondayDay] of [['UTC', 9], ['Asia/Shanghai', 16]]) {
test.describe(`浏览器时区 ${timezoneId}`, () => {
  test.use({ timezoneId });
  // 微信读书的时间戳仍按北京时间零点生成，不依赖运行测试的 Node 时区或当天日期。
  const firstDay = Date.UTC(2026, 10, mondayDay) / 1000 - 8 * 3600;
  const readTimes = Object.fromEntries([
    [firstDay - 86400, 60 * 50],
    ...minutes.flatMap((value, index) => value ? [[firstDay + index * 86400, value * 60]] : []),
  ]);

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`微信读书周趋势逐日展示分钟数 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.clock.setFixedTime(new Date('2026-11-15T19:00:00Z'));
    await setup(page);
    let syncMode = '';
    await page.route('**/api/weread/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/weread/connection')
        return route.fulfill({ json: { code: 0, data: { connected: true } } });
      if (url.pathname === '/api/weread/sync') {
        syncMode = url.searchParams.get('mode');
        return route.fulfill({ json: { code: 0, data: {
          shelf: { books: [] }, notebooks: { books: [] }, stats: { readTimes },
        } } });
      }
      return route.fulfill({ json: { code: 0, data: [] } });
    });
    await page.goto('/#/pages/records/weread');
    const chart = page.getByRole('figure', { name: '阅读时长趋势' });
    await expect(chart.locator('.chart-extreme-label')).toHaveText(minutes.map(String));
    expect(syncMode).toBe('weekly');
    await expect(chart.locator('.chart-x-label')).toHaveText(Array.from({ length: 7 }, (_, index) => `11/${mondayDay + index}`));
    await expect(chart.locator('.chart-selected-label, .mini-chart-values, .chart-tooltip')).toHaveCount(0);
    await expect(page.locator('.dashboard-filter').first()).toContainText('周');
    await expect(chart.locator('.chart-extreme-label').last()).toBeVisible();
    fs.mkdirSync('artifacts/weread-weekly-chart', { recursive: true });
    await chart.screenshot({ path: `artifacts/weread-weekly-chart/${timezoneId.replace('/', '-')}-${width}-${theme}.png` });
  });
}
});
}

const monthlyReadTimes = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
  Date.UTC(2026, 10, index + 1) / 1000 - 8 * 3600,
  (index === 24 ? 250 : index === 6 ? 2 : 36) * 60,
]));
const rank = [
  { book: { bookId: '9223372036854775807', title: '模拟阅读排行第一本' }, readTime: 15000 },
  { book: { bookId: '9223372036854775806', title: '模拟阅读排行第二本' }, readTime: 2160 },
];
const ok = data => ({ json: { code: 0, message: null, data } });

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`微信读书月趋势整数提示与卡片间距 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.clock.setFixedTime(new Date('2026-11-25T10:00:00Z'));
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'weread-chart-fixture'));
    apiMock({
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/weread/connection': ok({ connected: true }),
      'POST /api/weread/sync': ok({
        shelf: { books: [] }, notebooks: { books: [] },
        stats: { readTimes: {}, readLongest: rank }, lastSyncTime: '2026-11-25',
      }),
      'GET /api/weread/stats': request => {
        expect(new URL(request.url()).searchParams.get('mode')).toBe('monthly');
        return ok({ readTimes: monthlyReadTimes, readLongest: rank });
      },
    });
    await page.goto('/#/pages/records/weread');
    await page.getByLabel('周期', { exact: true }).click();
    const dropdown = page.locator('.uni-picker-select:visible');
    const wheel = page.locator('.uni-picker-content:visible .uni-picker-view-group');
    await expect(dropdown.or(wheel)).toBeVisible();
    if (await dropdown.isVisible()) {
      await dropdown.getByText('月', { exact: true }).click();
    } else {
      await wheel.hover();
      await page.mouse.wheel(0, 34);
      await expect.poll(() => wheel.getByText('月', { exact: true }).evaluate(element => {
        const indicator = element.closest('uni-picker-view-column').querySelector('.uni-picker-view-indicator');
        const row = element.getBoundingClientRect();
        const selected = indicator.getBoundingClientRect();
        return Math.abs(row.y + row.height / 2 - selected.y - selected.height / 2);
      })).toBeLessThan(0.5);
      await page.locator('.uni-picker-action-confirm:visible').click();
    }

    const chart = page.getByRole('figure', { name: '阅读时长趋势' });
    const extremes = chart.locator('.chart-extreme-label');
    const ranking = page.locator('.card').filter({ hasText: '阅读最多的书' });
    await expect(extremes).toHaveText(['250', '2']);
    await expect(chart.locator('.chart-x-label').first()).toHaveText('11/1');
    await expect(ranking.getByText('模拟阅读排行第二本')).toBeVisible();
    const chartBox = await stableBox(chart);
    const rankingBox = await ranking.boundingBox();
    expect(rankingBox.y - (chartBox.y + chartBox.height)).toBeCloseTo(section, 0);

    const canvas = chart.locator('.aio-chart-canvas');
    const canvasBox = await canvas.boundingBox();
    await canvas.click({ position: { x: canvasBox.width - 12, y: canvasBox.height / 2 } });
    const tooltip = chart.getByRole('tooltip');
    await expect(tooltip).toHaveText('250分钟');
    const tipBox = await tooltip.boundingBox();
    expect(tipBox.y + tipBox.height).toBeLessThanOrEqual((await extremes.first().boundingBox()).y);
    expect((await chart.boundingBox()).height).toBeCloseTo(chartBox.height, 0);
    await chart.getByRole('slider').press('ArrowLeft');
    await expect(tooltip).toHaveText('36分钟');

    fs.mkdirSync('artifacts/weread-chart-review', { recursive: true });
    await page.screenshot({ path: `artifacts/weread-chart-review/mobile-month-${width}-${theme}.png` });
  });
}
