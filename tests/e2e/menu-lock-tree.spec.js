const { test, expect } = require('@playwright/test');

const noteId = '9223372036854775807';
async function setup(page, hasPassword = true) {
  const state = { locked: [noteId], writes: [], fail: false };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'menu-tree-fixture'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path === '/api/user/info') data = { id: 'fixture', nickname: '模拟用户' };
    if (path === '/api/menu/all') data = [
      { name: '记录', meta: { menuId: 'root', title: '记录' }, children: [
        { name: '笔记', meta: { menuId: noteId, title: '笔记' } },
        { name: '资料', meta: { menuId: 'folder', title: '资料' }, children: [
          { name: '归档', meta: { menuId: 'archive', title: '工作与生活资料归档的长菜单名称' } },
        ] },
      ] },
      { name: '财务', meta: { menuId: 'finance', title: '财务' }, children: [
        { name: '收入', meta: { menuId: 'income', title: '收入' } },
        { name: '支出', meta: { menuId: 'expense', title: '支出' } },
      ] },
      { name: '配置分组', children: [{ name: '配置', meta: { menuId: 'settings', title: '配置' } }] },
      { name: '关于', meta: { menuId: 'about', title: '关于' } },
    ];
    if (path === '/api/auth/secondary-password/status') data = { hasPassword };
    if (path === '/api/auth/secondary-lock/menus') {
      if (route.request().method() === 'PUT') {
        state.writes.push(route.request().postDataJSON());
        if (state.fail) return route.fulfill({ json: { rscode: '1', result: '模拟保存失败' } });
        state.locked = state.writes.at(-1).menuIds;
      }
      data = state.locked;
    }
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/#/pages/profile/security');
  await expect(page.getByRole('button', { name: '收起记录', exact: true })).toBeVisible();
  return state;
}

test('折叠不丢失锁定选择，父子独立切换、失败重试与长 ID 保存', async ({ page }) => {
  const state = await setup(page);
  const note = page.locator('[aria-label="锁定记录 / 笔记"]');
  await expect(note).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '收起记录 / 资料', exact: true }).click();
  await page.getByRole('button', { name: '收起记录', exact: true }).click();
  await expect(note).toHaveCount(0);
  await page.getByRole('button', { name: '展开记录', exact: true }).click();
  await expect(note).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '展开记录 / 资料', exact: true })).toBeVisible();
  await page.locator('[aria-label="锁定记录"]').click();
  await expect(note).toHaveAttribute('aria-checked', 'true');
  await page.locator('[aria-label="锁定财务 / 收入"]').click();
  await page.getByRole('button', { name: '收起财务', exact: true }).click();
  state.fail = true;
  await page.getByRole('button', { name: '保存菜单锁', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认菜单锁', exact: true });
  await dialog.locator('[aria-label="二级密码"] input').fill('fixture-secondary');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('模拟保存失败');
  state.fail = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toEqual({ menuIds: [noteId, 'root', 'income'], secondaryPassword: 'fixture-secondary' });
  await expect(page.getByRole('button', { name: '展开财务', exact: true })).toBeVisible();
});

test('未设置二级密码时可以展开目录但不可修改菜单锁', async ({ page }) => {
  await setup(page, false);
  await expect(page.locator('[aria-label="锁定记录"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: '保存菜单锁', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '收起记录', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开记录', exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`菜单锁树形布局 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page);
    const parent = await page.getByText('记录', { exact: true }).boundingBox();
    const child = await page.getByText('笔记', { exact: true }).boundingBox();
    const nested = await page.getByText('工作与生活资料归档的长菜单名称', { exact: true }).boundingBox();
    expect(child.x).toBeGreaterThan(parent.x);
    expect(nested.x).toBeGreaterThan(child.x);
    const expand = await page.getByRole('button', { name: '收起记录', exact: true }).boundingBox();
    expect(expand.width).toBeGreaterThanOrEqual(44);
    expect(expand.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/menu-lock-tree/${width}-${theme}.png`, fullPage: true });
  });
}
