const { test, expect } = require('./support/test');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');

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
