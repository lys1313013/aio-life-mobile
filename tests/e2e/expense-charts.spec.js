const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');

async function openExpense(page, data) {
  await setup(page);
  await page.route('**/api/expense/statisticsByMonth', (route) => route.fulfill({ json: { code: 0, data } }));
  await page.goto('/#/pages/finance/expense');
  await expect(page.getByText('支出走势', { exact: true })).toBeVisible();
}
const year = new Date().getFullYear();
const months = [1, 2, 3].map((month) => ({ year, month, detail: [
  { typeId: '81', typeName: '餐饮', amt: month * 100 },
  { typeId: '82', typeName: '交通出行', amt: month * 50 },
  { typeId: '83', typeName: '家庭日常采购与长期订阅服务', amt: month * 25 },
] }));

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`支出图表月份交互与环形图 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExpense(page, months);
    await expect(page.locator('.chart-period-value, .chart-y-unit')).toHaveCount(0);
    await expect(page.locator('.mini-chart uni-picker')).toHaveCount(0);
    const chart = page.getByRole('figure', { name: '支出走势', exact: true });
    const plot = chart.getByRole('slider');
    await expect(chart.locator('.chart-y-tick').first()).toHaveText('0');
    await expect(chart.locator('.chart-extreme-label')).toHaveText(['525.00', '175.00']);
    const box = await plot.boundingBox();
    const height = (await chart.boundingBox()).height;
    const canvas = chart.locator('.aio-chart-canvas');
    const tooltip = chart.getByRole('tooltip');
    await expect(tooltip).toHaveCount(0);
    // Hover over the month slot, including blank space above a short bar.
    await canvas.hover({ position: { x: box.width / 2, y: 8 } });
    await expect(tooltip).toHaveText('350.00元');
    await canvas.hover({ position: { x: box.width - 12, y: 8 } });
    await expect(tooltip).toHaveText('525.00元');
    const tipBox = await tooltip.boundingBox();
    expect(tipBox.width).toBeLessThan(150);
    expect(tipBox.x).toBeGreaterThanOrEqual(box.x);
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(box.x + box.width);
    await plot.click({ position: { x: box.width * 0.2, y: 8 } });
    await expect(tooltip).toHaveText('175.00元');
    await expect(plot).toHaveAttribute('aria-valuenow', '0');
    await plot.press('ArrowRight');
    await expect(tooltip).toHaveText('350.00元');
    await plot.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await canvas.hover({ position: { x: box.width / 2, y: 8 } });
    await expect(tooltip).toHaveText('350.00元');
    fs.mkdirSync('artifacts/expense-charts', { recursive: true });
    await chart.screenshot({ path: `artifacts/expense-charts/tooltip-${width}-${theme}.png` });
    await page.getByText('支出走势', { exact: true }).click();
    await expect(tooltip).toHaveCount(0);
    expect((await chart.boundingBox()).height).toBe(height);
    await expect.poll(() => page.locator('.chart-y-tick').count()).toBeGreaterThan(2);
    await expect(chart).not.toContainText(/最高|最低/);
    await expect(page.locator('.distribution-total')).toHaveText('1050.00');
    await expect(page.locator('.distribution-row').first()).toContainText('57.1%');
    // A visible canvas alone does not prove sectors were painted.
    await expect.poll(() => page.locator('.distribution-canvas canvas').evaluate((canvas) => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
      return painted;
    })).toBeGreaterThan(500);
    fs.mkdirSync('artifacts/expense-charts', { recursive: true });
    await page.screenshot({ path: `artifacts/expense-charts/${width}-${theme}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('支出图表空数据和全零金额不会生成无效饼图', async ({ page }) => {
  await openExpense(page, []);
  await expect(page.locator('.distribution')).toContainText('暂无数据');
  await expect(page.locator('.distribution-canvas')).toHaveCount(0);
  await page.unroute('**/api/expense/statisticsByMonth');
  await page.route('**/api/expense/statisticsByMonth', (route) => route.fulfill({ json: { code: 0, data: [{ year, month: 1, detail: [{ typeName: '餐饮', amt: 0 }] }] } }));
  await page.reload();
  await expect(page.locator('.distribution')).toContainText('暂无数据');
  await expect(page.locator('.distribution-row')).toHaveCount(0);
});

test('全年月份、年份切换与饼图重绘', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const fullYear = Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1, detail: [
    { typeName: '餐饮', amt: (index + 1) * 100 }, { typeName: '交通', amt: 50 },
  ] }));
  await openExpense(page, [...fullYear, { year: year - 1, month: 2, detail: [{ typeName: '日用', amt: 888 }] }]);
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', '12月 支出1,250.00元');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('.chart-x-label').first()).toHaveText('1月');
  await expect(page.locator('.chart-x-label').last()).toHaveText('12月');
  await expect(page.getByRole('slider', { name: '支出走势，点击图表查看数值' })).toHaveAttribute('aria-valuemax', '11');
  await page.screenshot({ path: 'artifacts/expense-charts/full-year-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.locator('uni-picker[aria-label="选择年份"]').click();
  await page.locator('.uni-picker-item').filter({ hasText: new RegExp('^' + (year - 1) + '$') }).filter({ visible: true }).click();
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', '2月 支出888.00元');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('slider').press('ArrowRight');
  await expect(page.getByRole('tooltip')).toHaveText('888.00元');
  await expect(page.locator('.distribution-row')).toHaveCount(1);
  await expect(page.locator('.distribution-total')).toHaveText('888.00');
  await expect(page.locator('.distribution-percent')).toHaveText('100.0%');
  await expect(page.locator('.distribution-error')).toHaveCount(0);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`多分类明细折叠不改变完整饼图 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const names = ['住房物业', '餐饮美食', '人情往来', '交通出行', '充值缴费', '教育培训', '日用百货', '文化休闲', '服饰装扮', '生活服务', '医疗健康', '数码电器', '酒店旅游'];
    const detail = names.map((typeName, i) => ({ typeName, amt: (13 - i) * 100 }));
    detail.push({ typeName: '零金额分类', amt: 0 });
    await openExpense(page, [{ year, month: 1, detail }]);
    const chart = page.locator('.distribution');
    await expect(chart.locator('.distribution-row')).toHaveCount(5);
    await expect(chart.locator('.distribution-row').last()).toContainText('充值缴费');
    await expect(chart).not.toContainText('其他（');
    await expect(chart.locator('.distribution-total')).toHaveText('9100.00');
    await expect(chart).not.toContainText('零金额分类');
    const canvas = chart.locator('.distribution-canvas canvas');
    // Sample the center of every expected sector, including categories hidden in the legend.
    await expect.poll(() => canvas.evaluate((el) => {
      const ctx = el.getContext('2d');
      const ratio = el.width / 180;
      let sum = 0;
      return Array.from({ length: 13 }, (_, index) => {
        const value = (13 - index) * 100;
        const angle = -Math.PI / 2 + (sum + value / 2) / 9100 * Math.PI * 2;
        sum += value;
        return Array.from(ctx.getImageData(Math.round((90 + 72 * Math.cos(angle)) * ratio), Math.round((90 + 72 * Math.sin(angle)) * ratio), 1, 1).data).slice(0, 3);
      });
    })).toEqual(Array.from({ length: 13 }, (_, i) => [[66,123,234],[32,165,116],[231,166,56],[149,96,198],[224,82,96],[41,164,184],[207,119,62],[104,135,71]][i % 8]));
    const before = await canvas.evaluate((el) => el.toDataURL());
    await chart.scrollIntoViewIfNeeded();
    await chart.screenshot({ path: `artifacts/expense-charts/compact-legend-${width}-${theme}.png` });
    await page.getByRole('button', { name: '展开全部', exact: true }).click();
    await expect(chart.locator('.distribution-row')).toHaveCount(13);
    await expect(chart).toContainText('酒店旅游');
    expect(await canvas.evaluate((el) => el.toDataURL())).toBe(before);
    await expect(chart.locator('.distribution-total')).toHaveText('9100.00');
    await page.getByRole('button', { name: '收起', exact: true }).click();
    await expect(chart.locator('.distribution-row')).toHaveCount(5);
    expect(await canvas.evaluate((el) => el.toDataURL())).toBe(before);
    expect(await chart.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}


test.describe('触屏月份选择', () => {
  test.use({ hasTouch: true });
  test('零金额和极短柱可以通过上方空白区域选中', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    const detail = Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1,
      detail: [{ typeName: '餐饮', amt: index === 6 ? 0 : index === 7 ? 0.01 : 10000 }] }));
    await openExpense(page, detail);
    // 等待首屏请求和画布初始化完成，再测量坐标并触发触屏手势。
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.aio-chart-renderer')).toHaveAttribute('aria-busy', 'false');
    const plot = page.getByRole('slider');
    await expect(page.locator('.chart-y-tick').first()).toHaveText('0');
    const box = await plot.boundingBox();
    const axisWidth = (await page.locator('.chart-y-axis').boundingBox()).width;
    const plotWidth = box.width - axisWidth - 8;
    // Linux 触摸模拟会补发鼠标离开；显式移动鼠标，让各平台都覆盖此顺序。
    await page.mouse.move(box.x + axisWidth + plotWidth * 6.5 / 12, box.y + 10);
    await plot.tap({ position: { x: axisWidth + plotWidth * 6.5 / 12, y: 10 } });
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveText('0.00元');
    await plot.tap({ position: { x: axisWidth + plotWidth * 7.5 / 12, y: 10 } });
    await expect(page.getByRole('tooltip')).toHaveText('0.01元');
    await expect(page.getByRole('tooltip')).toHaveCount(0, { timeout: 5000 });
  });
});
