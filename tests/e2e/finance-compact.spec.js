const { test, expect } = require('@playwright/test');
const { start } = require('./qa-domains-ui');

test('财务高级筛选折叠后保留条件并显示数量', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const state = await start(page, 'finance/expense');
  const filters = page.getByRole('button', { name: /^更多筛选/ });
  await filters.click();
  const year = page.locator('.filters uni-picker[aria-label="年份"]');
  await expect(year).toContainText('全部年份');
  const yearBox = await year.boundingBox();
  const typeBox = await page.locator('.filters uni-picker[aria-label="类型"]').boundingBox();
  expect(Math.abs(yearBox.y - typeBox.y)).toBeLessThanOrEqual(1);
  await year.click();
  await page.locator('.uni-picker-item').filter({ hasText: /^2026$/ }).filter({ visible: true }).click();
  await page.locator('.filters input[aria-label="备注"]').fill('模拟交通');
  await expect(filters).toHaveAccessibleName('更多筛选，已启用 2 项条件');
  await filters.click();
  await expect(page.locator('.filters uni-picker[aria-label="年份"]')).toHaveCount(0);
  await expect(page.locator('.filter-count')).toHaveText('2');
  const request = page.waitForRequest((request) => request.url().includes('/expense/query'));
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  const query = new URL((await request).url());
  expect(query.searchParams.get('year')).toBe('2026');
  expect(query.searchParams.get('remark')).toBe('模拟交通');
  await filters.click();
  await expect(page.locator('.filters uni-picker[aria-label="年份"]')).toContainText('2026');
  await expect(page.locator('.filters input[aria-label="备注"]')).toHaveValue('模拟交通');
  expect(state.calls).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`财务多行金额与备注 ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const kind of ['income', 'expense']) {
        const state = await start(page, 'finance/' + kind);
        const records = [8.5, 1299, 12345678.9].map((amount, index) => ({
          id: '922337203685477580' + index,
          amt: amount,
          transactionAmt: amount,
          incTypeId: '81',
          expTypeId: '81',
          payTypeId: '82',
          incDate: `2026-10-0${3 - index}`,
          expTime: `2026-10-0${3 - index} 12:30:00`,
          remark: [
            '模拟早餐',
            '模拟家庭日常采购及交通报销记录',
            '模拟年度项目收入或家庭支出结算，备注较长时应省略显示，不挤压金额，也不产生横向滚动。',
          ][index],
          counterparty: kind === 'expense' ? '模拟商店与家庭日常服务中心' : '',
          transactionId: kind === 'expense' ? 'mock-transaction-20261002-000000000' + index : '',
          transactionStatus: kind === 'expense' ? '模拟已完成' : '',
        }));
        await page.route(`**/api/${kind}/query**`, (route) => route.fulfill({
          json: { rscode: '0', data: { items: records, total: records.length } },
        }));
        await page.getByRole('button', { name: '筛选', exact: true }).click();
        await expect(page.locator('.ledger-row')).toHaveCount(3);
        await expect(page.locator('.ledger-money').last()).toHaveText('¥12345678.90');
        await page.locator('.section-title').evaluate((element) => element.scrollIntoView({ block: 'start' }));
        const directory = require('node:path').resolve('artifacts/finance-compact');
        require('node:fs').mkdirSync(directory, { recursive: true });
        await page.screenshot({ path: `${directory}/${kind}-${width}-${theme}-records.png` });
        await page.locator('.ledger-row').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${directory}/${kind}-${width}-${theme}-last-record.png` });
        const geometry = await page.locator('.ledger-row').evaluateAll((elements) => elements.map((element) => {
          const box = element.getBoundingClientRect();
          const money = element.querySelector('.ledger-money');
          return {
            left: box.left,
            right: box.right,
            moneyFits: money.scrollWidth <= money.clientWidth,
            actions: [...element.querySelectorAll('[role="button"]')].map((button) => {
              const buttonBox = button.getBoundingClientRect();
              return { width: buttonBox.width, height: buttonBox.height };
            }),
          };
        }));
        for (const row of geometry) {
          expect(row.left).toBeGreaterThanOrEqual(0);
          expect(row.right).toBeLessThanOrEqual(width);
          expect(row.moneyFits).toBe(true);
          for (const action of row.actions) {
            expect(action.width).toBeGreaterThanOrEqual(44);
            expect(action.height).toBeGreaterThanOrEqual(44);
          }
        }
        expect(state.calls).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
}
