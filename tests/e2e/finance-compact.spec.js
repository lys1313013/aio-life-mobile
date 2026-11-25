const { test, expect } = require('./support/test');
const { start, picker } = require('./qa-domains-ui');
const { pullDown } = require('./gestures');

function filterButton(page, kind) {
  return page.getByRole('button', { name: kind === 'expense' ? '筛选支出' : '筛选收入', exact: true });
}
const filterSheet = page => page.getByRole('dialog', { name: '快捷筛选', exact: true });

test('支出筛选放在导入右侧，确定后提交并保留条件', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const state = await start(page, 'finance/expense');
  const filters = filterButton(page, 'expense');
  const importBox = await page.getByRole('button', { name: '导入账单', exact: true }).boundingBox();
  expect(importBox.x + importBox.width).toBeLessThanOrEqual((await filters.boundingBox()).x);
  const sheet = filterSheet(page);
  const year = sheet.locator('uni-picker[aria-label="年份"]');
  await filters.click();
  await expect(year).toContainText('全部年份');
  const yearBox = await year.boundingBox();
  const typeBox = await sheet.locator('uni-picker[aria-label="类型"]').boundingBox();
  expect(Math.abs(yearBox.y - typeBox.y)).toBeLessThanOrEqual(1);
  await picker(page, '年份', '2026');
  await sheet.getByRole('textbox', { name: '备注' }).fill('模拟交通');
  await sheet.getByRole('button', { name: '关闭筛选' }).click();
  await expect(sheet).toBeHidden();
  await filters.click();
  await expect(year).toContainText('全部年份');
  await expect(sheet.getByRole('textbox', { name: '备注' })).toHaveValue('');
  await picker(page, '年份', '2026');
  await sheet.getByRole('textbox', { name: '备注' }).fill('模拟交通');
  const [request] = await Promise.all([
    page.waitForRequest(request => new URL(request.url()).pathname === '/api/expense/query'),
    sheet.getByRole('button', { name: '确定', exact: true }).click(),
  ]);
  const query = new URL(request.url());
  expect(query.searchParams.get('year')).toBe('2026');
  expect(query.searchParams.get('remark')).toBe('模拟交通');
  await expect(sheet).toBeHidden();
  await expect(filters).toHaveAccessibleDescription('2 项条件');
  await filters.click();
  await expect(year).toContainText('2026');
  await expect(sheet.getByRole('textbox', { name: '备注' })).toHaveValue('模拟交通');
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
          bookkeepingAmount: amount, grossAmount: amount,
          transactionAmount: amount,
          incomeTypeId: '81',
          expenseTypeId: '81',
          payTypeId: '82',
          incomeDate: `${index === 2 ? 2025 : 2026}-10-0${3 - index}`,
          expenseTime: `2026-10-0${3 - index} 12:30:00`,
          remark: [
            '模拟早餐',
            '模拟家庭日常采购及交通报销记录',
            '模拟年度项目收入或家庭支出结算，备注较长时应省略显示，不挤压金额，也不产生横向滚动。',
          ][index],
          counterparty: kind === 'expense' ? '模拟商店与家庭日常服务中心' : '',
          transactionId: kind === 'expense' ? 'mock-transaction-20261002-000000000' + index : '',
          transactionStatus: kind === 'expense' ? '模拟已完成' : '',
        }));
        await page.route(`**/api/${kind}/query**`, (route) => {
          const year = new URL(route.request().url()).searchParams.get('year');
          const items = kind === 'income' && year ? records.filter(row => row.incomeDate.startsWith(year + '-')) : records;
          return route.fulfill({ json: { code: 0, message: null, data: { items, total: items.length } } });
        });
        await pullDown(page, '.mobile-page-scroll');
        await expect(page.locator('.ledger-row')).toHaveCount(3);
        await expect(page.getByRole('button', { name: '关联设备', exact: true })).toHaveCount(0);
        await expect(page.locator('.ledger-money').last()).toHaveText('¥12345678.90');
        await page.locator('.ledger-row').first().evaluate(element => element.scrollIntoView({ block: 'center' }));
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
        // 末条记录处仍能从公共悬浮入口新增，弹窗打开后隐藏入口。
        const add = page.getByRole('button', { name: '新增', exact: true });
        await expect(add).toBeVisible();
        await expect(page.locator('.ledger-toolbar').getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
        await add.click();
        const dialog = page.getByRole('dialog', { name: kind === 'income' ? '编辑收入' : '编辑支出', exact: true });
        await expect(dialog).toBeVisible();
        await expect(add).toHaveCount(0);
        await page.screenshot({ path: `${directory}/${kind}-${width}-${theme}-create.png` });
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        await expect(add).toBeVisible();
        if (kind === 'income') {
          const sheet = filterSheet(page);
          const filter = filterButton(page, kind);
          await filter.click();
          await expect(sheet.locator('uni-picker[aria-label="年份"]')).toContainText('全部年份');
          await picker(page, '年份', '2026');
          await page.screenshot({ path: `${directory}/${kind}-${width}-${theme}-filter.png` });
          const [annualRequest] = await Promise.all([
            page.waitForRequest(request => new URL(request.url()).pathname === '/api/income/query'),
            sheet.getByRole('button', { name: '确定', exact: true }).click(),
          ]);
          expect(new URL(annualRequest.url()).searchParams.get('year')).toBe('2026');
          await expect(page.locator('.ledger-row')).toHaveCount(2);
          await filter.click();
          await sheet.getByRole('button', { name: '重置', exact: true }).click();
          const [allRequest] = await Promise.all([
            page.waitForRequest(request => new URL(request.url()).pathname === '/api/income/query'),
            sheet.getByRole('button', { name: '确定', exact: true }).click(),
          ]);
          expect(new URL(allRequest.url()).searchParams.has('year')).toBe(false);
          await expect(page.locator('.ledger-row')).toHaveCount(3);
        }
        expect(state.calls).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
}
