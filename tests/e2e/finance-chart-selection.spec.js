const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const { picker } = require('./qa-domains-ui');

test.use({ hasTouch: true });

test('收入类型饼图切换年份后保留分类占比', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await setup(page);
  const year = new Date().getFullYear();
  await page.route('**/api/*/statisticsByMonth', (route) => route.fulfill({
    json: {
      code: 0,
      data: [year - 1, year].flatMap((value) => [1, 2, 3].map((month) => ({
        year: value,
        month,
        detail: [
          { typeId: '81', typeName: '工资', amt: (value === year ? 1000 : 100) * month },
          { typeId: '82', typeName: '奖金', amt: month * 10 },
        ],
      }))),
    },
  }));
  await page.goto('/#/pages/finance/income');
  await page.getByRole('button', { name: '统计', exact: true }).click();
  const chart = page.getByRole('figure', { name: '收入类型分布', exact: true });
  await expect(chart).toBeVisible();
  await expect(page.locator('.mini-chart uni-picker')).toHaveCount(0);
  await expect(page.locator('uni-picker[aria-label="选择年份"]')).toBeVisible();
  await expect(chart.getByRole('slider')).toHaveCount(0);
  await expect(chart.locator('.distribution-total')).toHaveText('6060.00');
  await expect(chart.locator('.distribution-name')).toHaveText(['工资', '奖金']);
  await expect(chart.locator('.distribution-amount')).toHaveText(['¥6000.00', '¥60.00']);
  await expect(chart.locator('.distribution-percent')).toHaveText(['99.0%', '1.0%']);
  await expect.poll(() => chart.locator('.distribution-canvas canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
    return painted;
  })).toBeGreaterThan(500);
  // 手机使用滚轮并确认；点击非选中的文字不会提交年份。
  await picker(page, '选择年份', String(year - 1));
  await expect(chart.locator('.distribution-total')).toHaveText('660.00');
  await expect(chart.locator('.distribution-amount')).toHaveText(['¥600.00', '¥60.00']);
  await expect(chart.locator('.distribution-percent')).toHaveText(['90.9%', '9.1%']);
});

test('财务概览日历切换指标时保留年份筛选', async ({ page }) => {
  const { calendarFixture } = require('./fixtures-finance-calendar');
  await page.setViewportSize({ width: 390, height: 1000 });
  await setup(page);
  const year = Number(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 4));
  const dates = [];
  await page.route('**/api/quick-nav/candidates*', route => route.fulfill({ json: { code: 0, data: ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'].map(path => ({ path })) } }));
  await page.route('**/api/home/sections/finance/calendar?*', route => {
    const url = new URL(route.request().url());
    const data = calendarFixture(url, 'finance');
    dates.push(data.date);
    if (data.date === String(year - 1)) {
      Object.assign(data, { income: 1000, expense: 400, balance: 600, amount: 600 });
      Object.assign(data.buckets[0], { income: 1000, expense: 400, balance: 600, amount: 600 });
    }
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/finance/index');
  const card = page.locator('[aria-label="收支概览首页卡片"]');
  await expect(card).toHaveAttribute('aria-busy', 'false');
  await card.getByRole('button', { name: '收支概览：月', exact: true }).click();
  await expect(card).toHaveAttribute('aria-busy', 'false');
  await expect(card.locator('.calendar-date')).toHaveText(year + '年');
  await expect(card.locator('.calendar-cell')).toHaveCount(12);
  await card.getByRole('button', { name: '上一时间段', exact: true }).click();
  await expect(card.locator('.calendar-date')).toHaveText((year - 1) + '年');
  await expect(card.locator('.calendar-amount').first()).toHaveText('600.00');
  await card.getByRole('button', { name: '查看收入', exact: true }).click();
  await expect(card.locator('.calendar-amount').first()).toHaveText('1,000.00');
  await card.getByRole('button', { name: '查看支出', exact: true }).click();
  await expect(card.locator('.calendar-amount').first()).toHaveText('400.00');
  await expect(card.locator('.calendar-date')).toHaveText((year - 1) + '年');
  expect(dates.at(-1)).toBe(String(year - 1));
});
