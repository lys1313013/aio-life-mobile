const { test, expect } = require('./support/test');
const legalFixture = require('./support/legal-fixture');

// 公共协议页独立于登录后的菜单、人格问卷及管理流程；每个矩阵用例使用新 context。
for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`注册协议导航与表单保留 ${width} ${theme}`, async ({ page, apiMock }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      apiMock({ 'GET /api/auth/legal': { json: { code: 0, message: null, data: legalFixture } } });
      await test.step('从登录进入注册并填写邮箱', async () => {
        await page.goto('/#/pages/login/index');
        await page.getByRole('button', { name: '注册账号', exact: true }).click();
        await expect(page).toHaveURL(/\/pages\/auth\/index\?mode=register/);
        await page.getByRole('textbox', { name: '邮箱', exact: true }).fill('fixture@example.test');
      });
      const registrationUrl = page.url();
      for (const [name, kind, sections] of [
        ['隐私政策', 'privacy', legalFixture.privacy],
        ['服务条款', 'terms', legalFixture.terms],
      ]) {
        await test.step(`${name}：路由、内容、版本、联系信息与返回`, async () => {
          await page.getByRole('button', { name, exact: true }).click();
          await expect(page).toHaveURL(new RegExp('/pages/auth/policy\\?kind=' + kind));
          await expect(page.getByText(sections[0][1], { exact: true })).toBeVisible();
          await expect(page.locator('.policy-meta')).toContainText(legalFixture.version);
          await expect(page.getByText(`隐私联系邮箱：${legalFixture.contactEmail}`, { exact: true })).toBeVisible();
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
            message: `${name}不应产生横向溢出`,
          }).toBe(true);
          await testInfo.attach(kind, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
          await page.getByRole('button', { name: '返回', exact: true }).click();
          await expect(page).toHaveURL(registrationUrl);
          await expect(page.getByRole('textbox', { name: '邮箱', exact: true })).toHaveValue('fixture@example.test');
        });
      }
    });
  }
}

test('协议加载失败可重试，并显示服务端内容', async ({ page, apiMock }) => {
  let failed = true;
  apiMock({
    'GET /api/auth/legal': () => ({ json: failed
      ? { code: 1, message: '模拟协议暂不可用' }
      : { code: 0, message: null, data: legalFixture } }),
  });
  await page.goto('/#/pages/auth/policy?kind=privacy');
  await expect(page.getByRole('alert')).toContainText('模拟协议暂不可用');
  failed = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText(legalFixture.privacy[0][1], { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
