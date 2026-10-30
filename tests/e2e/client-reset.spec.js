const { test, expect } = require('./support/test');

test('系统设置清缓存先确认，清理登录及本地设置后进入登录页', async ({ page, apiMock }) => {
  apiMock({
    'GET /api/auth/secondary-lock/menus': { json: { code: 0, message: null, data: [] } },
  });
  await page.addInitScript(() => {
    const items = { 'aio-life-mobile.access-token.v1': 'reset-fixture', 'aio-life-mobile.theme.v1': 'dark', 'aio-life-mobile.password-vault.mock': 'mock-local-setting', 'mock-old-cache': 'mock-cache' };
    for (const [key, data] of Object.entries(items)) localStorage.setItem(key, JSON.stringify({ type: 'string', data }));
  });
  await page.goto('/#/pages/profile/preferences?section=system');
  await page.getByRole('button', { name: '清除缓存', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '清除缓存', exact: true });
  await expect(confirm).toContainText('需要重新登录');
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('aio-life-mobile.access-token.v1'))).toContain('reset-fixture');
  await page.getByRole('button', { name: '清除缓存', exact: true }).click();
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page).toHaveURL(/\/pages\/login\/index/);
  expect(await page.evaluate(() => ['aio-life-mobile.access-token.v1', 'aio-life-mobile.theme.v1', 'aio-life-mobile.password-vault.mock', 'mock-old-cache'].map(key => localStorage.getItem(key)))).toEqual([null, null, null, null]);
});
