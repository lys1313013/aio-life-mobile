const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test.use({ hasTouch: true });

for (const kind of ['index', 'income']) {
  test(`财务 ${kind} ${kind === 'income' ? '类型饼图' : '柱图选择'}并保留年份筛选`, async ({ page }) => {
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
    if (kind === 'income') {
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
      await page.locator('uni-picker[aria-label="选择年份"]').click();
      await page.locator('.uni-picker-item').filter({ hasText: new RegExp('^' + (year - 1) + '$') }).filter({ visible: true }).click();
      await expect(chart.locator('.distribution-total')).toHaveText('660.00');
      await expect(chart.locator('.distribution-amount')).toHaveText(['¥600.00', '¥60.00']);
      await expect(chart.locator('.distribution-percent')).toHaveText(['90.9%', '9.1%']);
      return;
    }
    const plot = chart.getByRole('slider');
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    // The empty space over a short bar is also a usable touch target.
    await plot.tap({ position: { x: box.width * 0.1, y: 10 } });
    await expect(plot).toHaveAttribute('aria-valuenow', '0');
    await expect(chart.locator('.chart-selected-label')).toHaveText(String(year - 1));
    await expect(chart.locator('.chart-value-number').first()).toContainText('660.00元');
    await plot.press('ArrowRight');
    await expect(chart.locator('.chart-selected-label')).toHaveText(String(year));
    await expect(chart.locator('.chart-value-number').first()).toContainText('6,060.00元');
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
