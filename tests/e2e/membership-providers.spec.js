const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { picker } = require('./qa-domains-ui');
const { setup, id } = require('./qa-records-fixtures');
const entries = [{ menuId: 'member', path: '/membership', title: '订阅' }, { menuId: 'platforms', path: '/system/membership-providers', title: '会员平台' }];
const providers = [{ id: '9007199254740993', name: '腾讯视频', code: 'tencent_video', category: 'video', iconKey: 'tencent_video', sortOrder: 0, isEnabled: 1 }, { id: '9007199254740994', name: '网易云音乐', code: 'netease_music', category: 'music', iconKey: 'netease_music', sortOrder: 1, isEnabled: 1 }, { id: '9007199254740995', name: 'Claude', code: 'claude', category: 'AI', iconKey: 'claude', sortOrder: 2, isEnabled: 1 }, { id: '195034', name: 'OpenCode Go', code: 'opencode_go', category: 'AI', iconKey: 'opencode_go', sortOrder: 3, isEnabled: 1 }];
async function customProvider(page, choice, options, screenshot) {
  await page.getByRole('button', { name: '选择会员平台', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '选择会员平台', exact: true });
  await expect(dialog.locator('.provider-option-name')).toHaveText(options);
  if (screenshot) await page.screenshot({ path: screenshot });
  await dialog.getByRole('button', { name: choice === '自定义平台' ? '选择自定义平台' : '选择平台：' + choice, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function prepare(page) {
  const state = await setup(page);
  state.members[0] = { ...state.members[0], providerId: providers[0].id, providerName: providers[0].name, providerIconKey: providers[0].iconKey };
  await page.route('**/api/quick-nav/candidates?client=mobile', route => route.fulfill({ json: { code: 0, data: entries } }));
  await page.route('**/api/menu/preferences?client=mobile', route => route.fulfill({ json: { code: 0, data: { menus: entries.map(e => ({ id: e.menuId, title: e.title, children: [] })), hiddenMenuIds: [] } } }));
  await page.route('**/api/membership/providers', route => route.fulfill({ json: state.providersFail ? { code: 1, message: '模拟平台加载失败' } : { code: 0, data: providers } }));
  const catalog = process.env.MEMBERSHIP_LOGO_DIR ? JSON.parse(fs.readFileSync(path.join(process.env.MEMBERSHIP_LOGO_DIR, 'membership-icons.json'), 'utf8')) : providers.filter(row => row.iconKey).map(row => ({ key: row.iconKey, name: row.name }));
  await page.route('**/api/membership/provider-icons', route => route.fulfill({ json: { code: 0, data: catalog.map(row => ({ key: row.key, name: row.name, url: '/api/membership/provider-icons/' + row.key })) } }));
  await page.route('**/api/membership/provider-icons/*', route => {
    const url = new URL(route.request().url()); const key = url.pathname.split('/').at(-1).replaceAll('-', '_');
    const icon = catalog.find(row => row.key === key);
    const file = url.searchParams.get('dark') === 'true' && icon?.darkFile ? icon.darkFile : icon?.file || key + '.png';
    const logo = process.env.MEMBERSHIP_LOGO_DIR && path.join(process.env.MEMBERSHIP_LOGO_DIR, file);
    return logo && fs.existsSync(logo) ? route.fulfill({ path: logo, contentType: 'image/png' }) : route.fulfill({ status: 404, body: '' });
  });
  state.providers = providers.map(row => ({ ...row }));
  await page.route('**/api/system/membership-providers**', route => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { code: 0, data: state.providers } });
    const body = req.method() === 'DELETE' ? null : req.postDataJSON(); state.writes.push({ path: new URL(req.url()).pathname, method: req.method(), body });
    const saved = req.method() === 'DELETE' ? null : { ...body, id: req.method() === 'POST' ? '9007199254740999' : new URL(req.url()).pathname.split('/').at(-1) };
    if (!state.fail) state.providers = [...state.providers.filter(row => !new URL(req.url()).pathname.endsWith('/' + row.id)), ...(saved ? [saved] : [])];
    return route.fulfill({ json: state.fail ? { code: 1, message: '模拟平台保存失败' } : { code: 0, data: saved } });
  });
  return state;
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`会员平台显示及选择 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const state = await prepare(page);
    await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
    await page.getByRole('button', { name: '订阅', exact: true }).click();
    await expect(page.locator('.member-provider')).toContainText('腾讯视频');
    await page.getByRole('button', { name: '编辑订阅：模拟会员', exact: true }).click();
    await expect(page.getByRole('button', { name: '选择会员平台', exact: true })).toContainText('腾讯视频');
    await page.screenshot({ path: `artifacts/membership-providers/member-${width}-${theme}.png` });
    await picker(page, '分类', 'AI');
    await customProvider(page, '自定义平台', ['自定义平台', 'Claude', 'OpenCode Go'], `artifacts/membership-providers/category-AI-${width}-${theme}.png`);
    await picker(page, '分类', '音乐');
    await customProvider(page, '网易云音乐', ['自定义平台', '网易云音乐']);
    await expect(page.locator('uni-picker[aria-label="分类"]')).toContainText('音乐');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.writes.at(-1).body).toMatchObject({ id, providerId: providers[1].id, category: 'music' });
  });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`会员平台管理 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const state = await prepare(page);
    await page.route('**/api/user/info', route => route.fulfill({ json: { code: 0, data: { id: '6', nickname: '模拟管理员', roles: ['admin'] } } }));
    await page.goto('/#/pages/admin/membership-providers');
    await page.reload();
    await page.getByRole('button', { name: '编辑平台：腾讯视频', exact: true }).click();
    await page.screenshot({ path: `artifacts/membership-providers/admin-${width}-${theme}.png` });
    await page.getByRole('button', { name: '选择网易云音乐图标', exact: true }).click();
    await picker(page, '状态', '停用');
    state.fail = true;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('模拟平台保存失败');
    state.fail = false;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.writes.at(-1)).toMatchObject({ method: 'PUT', body: { isEnabled: 0, iconKey: 'netease_music' } });
    await expect(page.getByRole('button', { name: '编辑平台：腾讯视频', exact: true })).toContainText('停用');
    await page.screenshot({ path: `artifacts/membership-providers/admin-list-${width}-${theme}.png` });
  });
}

test('平台加载失败可重试，解除平台显式发送null，旧文本保留', async ({ page }) => {
  const state = await prepare(page); state.providersFail = true;
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await page.getByRole('button', { name: '订阅', exact: true }).click();
  await page.getByRole('button', { name: '编辑订阅：模拟会员', exact: true }).click();
  await expect(page.getByText('模拟平台加载失败', { exact: true })).toBeVisible();
  state.providersFail = false;
  await page.getByRole('button', { name: '重试平台加载', exact: true }).click();
  await expect(page.getByText('模拟平台加载失败', { exact: true })).toHaveCount(0);
  await customProvider(page, '自定义平台', ['自定义平台', '腾讯视频']);
  await expect(page.locator('[aria-label="自定义平台"] input')).toHaveValue('模拟平台');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.writes.at(-1).body.providerId).toBeNull();
});

test('平台新增、删除失败保留弹窗并重试', async ({ page }) => {
  const state = await prepare(page);
  await page.route('**/api/user/info', route => route.fulfill({ json: { code: 0, data: { id: '6', nickname: '模拟管理员', roles: ['admin'] } } }));
  await page.goto('/#/pages/admin/membership-providers'); await page.reload();
  await page.getByRole('button', { name: '新增会员平台', exact: true }).click();
  await page.getByRole('textbox', { name: '平台名称', exact: true }).fill('模拟新增平台');
  await page.getByRole('textbox', { name: '平台编码', exact: true }).fill('new_demo');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.writes.at(-1)).toMatchObject({ method: 'POST', body: { name: '模拟新增平台', code: 'new_demo', iconKey: null, isEnabled: 1 } });
  await page.getByRole('button', { name: '编辑平台：模拟新增平台', exact: true }).click();
  await page.getByRole('button', { name: '删除平台', exact: true }).click();
  state.fail = true;
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('模拟平台保存失败');
  state.fail = false;
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑平台：模拟新增平台', exact: true })).toHaveCount(0);
});
