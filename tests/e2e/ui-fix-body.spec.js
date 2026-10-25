const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

const profile = {
  id: '9223372036854775807', version: 1, updateTime: null,
  gender: 'male', heightCm: 178, weightKg: 72, bodyFatPercent: null,
  shoulderWidthCm: null, chestCm: null, upperArmCm: null, forearmCm: null,
  waistCm: null, hipCm: null, thighCm: null, calfCm: null, inseamCm: null,
  measurementSide: null, armState: null, topSize: '', trousersSize: '',
  shoeSize: '42', shoeSystem: 'EU',
};

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`身体数据长表单操作始终可见 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), theme);
    let writes = 0;
    await page.route(`${testInfo.project.use.baseURL}/api/**`, async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data = dashboardFixture(path);
      if (path === '/api/auth/login') data = { accessToken: 'body-ui-fixture' };
      if (path === '/api/user/info') data = { id: '7', nickname: '模拟用户', accountUsername: 'fixture' };
      if (path === '/api/body-profile') {
        if (request.method() !== 'GET') writes++;
        data = profile;
      }
      await route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } });
    });
    await page.goto('/');
    await page.locator('[aria-label="账号"] input').fill('fixture');
    await page.locator('[aria-label="密码"] input').fill('fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    await page.goto('/#/pages/body-profile/index');
    await page.getByRole('button', { name: '编辑身体数据', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑身体数据', exact: true });
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    const cancel = dialog.getByRole('button', { name: '取消', exact: true });
    await expect(save).toBeInViewport();
    await expect(cancel).toBeInViewport();
    await expect(dialog.getByRole('button', { name: '填写说明', exact: true })).toBeInViewport();
    const before = await save.boundingBox();
    await page.screenshot({ path: testInfo.outputPath('body-editor-top.png') });
    await dialog.locator('[aria-label="鞋码"] input').scrollIntoViewIfNeeded();
    await expect(dialog.locator('uni-picker[aria-label="鞋码类型"] .form-field-input')).toHaveText('欧码（EU）');
    await expect(save).toBeInViewport();
    const after = await save.boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('body-editor-bottom.png') });
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toBe(0);
  });
}
