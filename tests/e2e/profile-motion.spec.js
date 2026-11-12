const { test, expect } = require('./support/test');
const { capturePageMotion, captureModalMotion } = require('./support/motion');

async function setup(page, apiMock) {
  const ok = data => ({ json: { code: 0, message: null, data } });
  apiMock({
    'GET /api/user/info': ok({ id: '9223372036854775807', accountUsername: 'motion-fixture', nickname: '动效模拟用户', email: 'motion@example.com', introduction: '用于导航动效验证的模拟资料', roles: [] }),
    'GET /api/message/unread-count': ok({ count: 0 }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/userbinds/list': ok([]),
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'motion-fixture'));
  await page.goto('/#/pages/profile/index');
  await expect(page.getByRole('button', { name: '账号与安全', exact: true })).toBeVisible();
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`我的页面成对进退和公共弹窗 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, apiMock);
    await page.getByRole('button', { name: '账号与安全', exact: true }).click();
    await capturePageMotion(page, 'forward', `test-results/profile-push-${width}-${theme}.png`);
    await page.getByRole('button', { name: '账号绑定', exact: true }).click();
    await capturePageMotion(page, 'forward', `test-results/profile-push-binding-${width}-${theme}.png`);
    await page.getByRole('button', { name: '新增绑定', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '绑定账号', exact: true });
    await expect(dialog).toBeVisible();
    await captureModalMotion(page, false, `test-results/profile-modal-open-${width}-${theme}.png`);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await captureModalMotion(page, true, `test-results/profile-modal-close-${width}-${theme}.png`);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.modal-mask')).toHaveCount(0);
    // 紧接着重新打开，确认退出动画没有遗留遮罩或影响新弹窗。
    await page.getByRole('button', { name: '新增绑定', exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.locator('.modal-mask').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await capturePageMotion(page, 'back', `test-results/profile-pop-${width}-${theme}.png`);
    await page.goBack();
    await capturePageMotion(page, 'back', `test-results/profile-browser-back-${width}-${theme}.png`);
    await expect(page.getByRole('button', { name: '编辑资料', exact: true })).toBeVisible();
  });
}

test('减少动态效果时页面和弹窗即时切换，保留导航栈', async ({ page, apiMock }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, apiMock);
  await page.getByRole('button', { name: '账号与安全', exact: true }).click();
  await expect(page.getByText('motion@example.com', { exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/aio-page-motion/);
  await page.getByRole('button', { name: '账号绑定', exact: true }).click();
  await page.getByRole('button', { name: '新增绑定', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByText('motion@example.com', { exact: true })).toBeVisible();
});
