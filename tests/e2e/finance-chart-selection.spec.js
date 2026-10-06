const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test.use({ hasTouch: true });

for (const kind of ['index', 'income']) {
  test(`财务 ${kind} 图表直接选择柱子并保留年份筛选`, async ({ page }) => {
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
    await page.goto(`/#/pages/finance/${kind}`);
    const chart = page.getByRole('figure', {
      name: kind === 'index' ? '年度收支对比' : '收入类型分布',
      exact: true,
    });
    await expect(chart).toBeVisible();
    await expect(page.locator('.mini-chart uni-picker')).toHaveCount(0);
    await expect(page.locator(`uni-picker[aria-label="${kind === 'index' ? '年份' : '选择年份'}"]`)).toBeVisible();
    const plot = chart.getByRole('slider');
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    // The empty space over a short bar is also a usable touch target.
    await plot.tap({ position: { x: box.width * 0.1, y: 10 } });
    await expect(plot).toHaveAttribute('aria-valuenow', '0');
    await expect(chart.locator('.chart-selected-label')).toHaveText(kind === 'index' ? String(year - 1) : '工资');
    await expect(chart.locator('.chart-value-number').first()).toContainText(kind === 'index' ? '660.00元' : '6,000.00元');
    await plot.press('ArrowRight');
    await expect(chart.locator('.chart-selected-label')).toHaveText(kind === 'index' ? String(year) : '奖金');
    await expect(chart.locator('.chart-value-number').first()).toContainText(kind === 'index' ? '6,060.00元' : '60.00元');
    if (kind === 'index') {
      await chart.getByRole('button', { name: '结余率', exact: true }).click();
      const rate = page.getByRole('figure', { name: '年度结余率', exact: true });
      await expect(rate.locator('uni-picker')).toHaveCount(0);
      await rate.getByRole('slider').press('ArrowLeft');
      await expect(rate.locator('.chart-selected-label')).toHaveText(String(year - 1));
      await expect(rate.locator('.chart-value-number')).toContainText('0.0%');
    }
  });
}
