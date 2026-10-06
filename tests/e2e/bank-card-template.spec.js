const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

const fileId = 'a'.repeat(32);
const templateId = '90071992547409931';
const publicPath = `/api/public/images/${fileId}.png`;
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" rx="30" fill="#31567a"/><text x="50" y="95" fill="white" font-size="40">DEMO BANK</text></svg>';

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`公共卡面选用及保存失败恢复 ${width} ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const state = await setup(page, baseURL);
      let failList = true;
      await page.route('**/api/bank-cards/cover-templates?**', async route => {
        const url = new URL(route.request().url());
        expect(url.searchParams.get('bankId')).toBe('9');
        expect(url.searchParams.get('cardType')).toBe('credit');
        if (failList) return route.fulfill({json:{code:1,message:'模拟卡面读取失败'}});
        return route.fulfill({json:{code:0,data:[{id:templateId,name:'模拟公共卡面',fileId,publicUrl:baseURL+publicPath}]}});
      });
      let publicRequests = 0;
      await page.route(`**${publicPath}`, route => {
        expect(route.request().headers()).not.toHaveProperty('authorization');
        publicRequests++;
        return route.fulfill({contentType:'image/svg+xml',body:image});
      });
      await page.route(`**/api/file/preview/${fileId}`, () => { throw new Error('公共模板不应走鉴权预览'); });
      await page.goto('/#/pages/finance/cards');
      await page.getByRole('button', { name: '银行卡更多操作', exact: true }).first().click();await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
      await page.getByRole('button', {name:'选择公共卡面',exact:true}).click();
      await expect(page.getByText('模拟卡面读取失败')).toBeVisible();
      failList = false;
      await page.getByRole('button', {name:'重试',exact:true}).click();
      await expect(page.getByRole('button', {name:'选用模拟公共卡面',exact:true})).toBeEnabled();
      await page.screenshot({path:`artifacts/bank-card-template/${width}-${theme}-options.png`,fullPage:true});
      await page.getByRole('button', {name:'选用模拟公共卡面',exact:true}).click();
      await expect(page.locator('.draft-cover')).toBeVisible();
      expect(publicRequests).toBeGreaterThan(0);
      await expect(page.locator('.draft-cover img')).toHaveAttribute('src', baseURL+publicPath);
      state.fail = true;
      await page.getByRole('button', {name:'保存',exact:true}).click();
      await expect(page.getByText('模拟保存失败')).toBeVisible();
      expect(state.calls.at(-1).body.coverTemplateId).toBe(templateId);
      expect(state.calls.at(-1).body.coverFileIds).toEqual([]);
      expect(state.calls.at(-1).body).not.toHaveProperty('coverTemplateFileId');
      expect(state.calls.at(-1).body).not.toHaveProperty('templateBankId');
      state.fail = false;
      state.cards[0].coverTemplateFileId = fileId;
      state.cards[0].coverTemplatePublicUrl = baseURL+publicPath;
      await page.getByRole('button', {name:'保存',exact:true}).click();
      await expect(page.getByRole('dialog', {name:'银行卡',exact:true})).toHaveCount(0);
      await page.getByRole('button', { name: '银行卡更多操作', exact: true }).first().click();await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
      await page.getByRole('button', {name:'移除卡面',exact:true}).click();
      await page.getByRole('button', {name:'保存',exact:true}).click();
      expect(state.calls.at(-1).body.coverTemplateId).toBeNull();
    });
  }
}
