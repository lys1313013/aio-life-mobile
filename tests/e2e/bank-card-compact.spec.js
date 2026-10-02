const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/bank-card-compact');

for (const width of [320, 390, 600, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`银行卡卡面及菜单 H5模拟 ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = await setup(page);
      state.cards = [
        { ...state.cards[0], cardNoFirst4: '6222', cardType: 'debit', cardName: null, bankCode: 'ICBC', bankName: '模拟工商银行', coverColor: '#87534F' },
        { ...state.cards[0], id: '89', cardNoFirst4: '0012', cardNoLast4: '8901', bankName: '模拟超长银行名称用于检查标题与按钮', cardName: '模拟白金信用卡', alias: '差旅信用卡', status: 'frozen', creditLimit: 123456.78, statementDay: 12, repaymentDay: 28, coverColor: '#685174', tags: [{ id: '90', name: '差旅消费' }], remark: '模拟备注：银行卡信息与卡面分层展示，长文字自然换行。', sortOrder: 2 },
        { ...state.cards[0], id: '90', cardNoFirst4: '4333', coverFileIds: ['mock-cover'], bankName: '模拟图片封面银行', cardType: 'debit', sortOrder: 3 },
      ];
      await page.route('**/api/file/preview/mock-cover', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="378"><rect width="600" height="378" fill="#e5edf8"/><circle cx="460" cy="110" r="190" fill="#adc4e0"/></svg>' }));
      await page.route('**/api/bank-cards/88/number', route => route.fulfill({ json: { rscode: '0', data: '6222000000000001234' } }));
      await page.goto('/#/pages/finance/cards');
      await expect(page.locator('.card-grid .card')).toHaveCount(3);
      await expect(page.locator('.number').first()).toHaveText('6222 •••• 1234');
      await expect(page.locator('.navigation-title')).toHaveText('');
      await expect(page.locator('.card-actions')).toHaveCount(0);
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({ path: `${out}/${width}-${theme}.png`, fullPage: true });
      const geometry = await page.locator('.card').evaluateAll(cards => cards.map(card => {
        const face = card.querySelector('.card-face').getBoundingClientRect();
        const number = card.querySelector('.number').getBoundingClientRect();
        const chip = card.querySelector('.card-chip')?.getBoundingClientRect();
        const more = card.querySelector('.card-more').getBoundingClientRect();
        return { inside: number.left >= face.left && number.right <= face.right + 1 && number.top >= face.top && number.bottom <= face.bottom, aligned: !chip || Math.abs((chip.top + chip.height / 2) - (number.top + number.height / 2)) < 2, width: more.width, height: more.height };
      }));
      for (const card of geometry) { expect(card.inside).toBe(true); expect(card.aligned).toBe(true); expect(card.width).toBeGreaterThanOrEqual(44); expect(card.height).toBeGreaterThanOrEqual(44); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const more = page.getByRole('button', { name: '银行卡更多操作', exact: true }).first();
      await more.click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.screenshot({ path: `${out}/${width}-${theme}-menu.png`, fullPage: true });
      await page.getByRole('menuitem', { name: '查看卡号', exact: true }).click();
      await expect(page.locator('.number').first()).toHaveText('6222 0000 0000 0001 234');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await more.click();
      await page.getByRole('menuitem', { name: '隐藏卡号', exact: true }).click();
      await expect(page.locator('.number').first()).toHaveText('6222 •••• 1234');
      await more.click();
      await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '银行卡', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '更多信息', exact: true }).click();
      await expect(page.getByRole('textbox', { name: '开户支行', exact: true })).toBeVisible();
      await page.screenshot({ path: `${out}/${width}-${theme}-editor.png`, fullPage: true });
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await more.click();
      await page.getByRole('menuitem', { name: '删除银行卡', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '删除银行卡', exact: true })).toBeVisible();
      await page.screenshot({ path: `${out}/${width}-${theme}-confirm.png`, fullPage: true });
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.locator('.card-grid .card')).toHaveCount(3);
      expect(state.calls).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
