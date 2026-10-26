const { test, expect } = require('@playwright/test');
async function setup(page, hasPassword = false) {
  const state = { writes: [], codeSent: 0, fail: false };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'numeric-fixture'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/api/user/info') data = { id: 'fixture', nickname: '模拟用户' };
    if (path === '/api/auth/secondary-password/status') data = { hasPassword };
    if (path === '/api/auth/send-reset-secondary-password-code') state.codeSent++;
    if (['/api/auth/secondary-password', '/api/auth/reset-secondary-password'].includes(path)) {
      state.writes.push({ path, ...route.request().postDataJSON() });
      if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟验证失败' } });
    }
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/profile/security');
  await page.getByRole('button', { name: hasPassword ? '修改二级密码' : '设置二级密码', exact: true }).click();
  return state;
}
async function digits(dialog, value) { for (const n of value) await dialog.getByRole('button', { name: n, exact: true }).click(); }

test('数字键盘设置与确认、非固定长度、前导零、删除和最少四位', async ({ page }) => {
  const state = await setup(page);
  const dialog = page.getByRole('dialog', { name: '二级密码', exact: true });
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toHaveCount(0);
  await digits(dialog, '001');
  await expect(dialog.getByRole('button', { name: '确认密码' })).toBeDisabled();
  await digits(dialog, '23456789');
  await dialog.getByRole('button', { name: '删除一位' }).click();
  await expect(dialog.locator('input')).toHaveValue('0012345678');
  await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('再次输入密码', { exact: true })).toBeVisible();
  await dialog.locator('input').fill('9999');
  await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('两次输入的密码不一致');
  for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name: '删除一位' }).click();
  await digits(dialog, '0012345678');
  await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toEqual([{ path: '/api/auth/secondary-password', password: '0012345678' }]);
});

test('旧密码使用数字键盘，失败后可以修正数字密码重试', async ({ page }) => {
  const state = await setup(page, true); state.fail = true;
  const dialog = page.getByRole('dialog', { name: '二级密码', exact: true });
  await expect(dialog.getByText('验证旧二级密码', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/支持原字母密码/)).toHaveCount(0);
  await digits(dialog, '0011'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('设置数字二级密码', { exact: true })).toBeVisible();
  await digits(dialog, '0012'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('再次输入密码', { exact: true })).toBeVisible();
  await digits(dialog, '0012'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('模拟验证失败');
  await expect(dialog.locator('input')).toHaveValue('0011');
  state.fail = false;
  for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name: '删除一位' }).click();
  await digits(dialog, '0022'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('设置数字二级密码', { exact: true })).toBeVisible();
  await digits(dialog, '0012'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('再次输入密码', { exact: true })).toBeVisible();
  await digits(dialog, '0012'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toEqual({ path: '/api/auth/secondary-password', oldPassword: '0022', password: '0012' });
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`数字键盘居中与深浅主题 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    await setup(page);
    const dialog = page.getByRole('dialog', { name: '二级密码', exact: true });
    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(320); expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(3);
    const key = await dialog.getByRole('button', { name: '1', exact: true }).boundingBox(); expect(key.width).toBeGreaterThanOrEqual(44); expect(key.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `artifacts/numeric-secondary-password/${width}-${theme}.png` });
  });
}

test('忘记密码仅通过邮箱验证码重置，无旧字母密码入口', async ({ page }) => {
  const state = await setup(page, true);
  await page.mouse.click(4, 4);
  await page.getByRole('button', { name: '忘记密码', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '二级密码', exact: true });
  await dialog.getByRole('button', { name: '发送验证码' }).click();
  await expect.poll(() => state.codeSent).toBe(1);
  await dialog.locator('input').fill('123456');
  await dialog.getByRole('button', { name: '下一步' }).click();
  await digits(dialog, '0000'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog.getByText('再次输入密码', { exact: true })).toBeVisible();
  await digits(dialog, '0000'); await dialog.getByRole('button', { name: '确认密码' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toEqual({ path: '/api/auth/reset-secondary-password', code: '123456', password: '0000' });
  await page.getByRole('button', { name: '忘记密码', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '使用旧密码修改' })).toHaveCount(0);
  await expect(dialog.getByText('找回二级密码', { exact: true })).toBeVisible();
});

test('数字旧密码键盘可直接进入邮箱找回', async ({ page }) => {
  await setup(page, true);
  const dialog = page.getByRole('dialog', { name: '二级密码', exact: true });
  await dialog.getByRole('button', { name: '忘记密码', exact: true }).click();
  await expect(dialog.getByText('找回二级密码', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '使用旧密码修改' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '发送验证码' })).toBeVisible();
});
