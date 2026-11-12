const { test, expect } = require('./support/test');
const ok = data => ({ json: { code: 0, message: null, data } });
const general = { id: '1508', name: 'exerciseCategoryConfig', path: '/my-hub/exercise/category-config', meta: { visibleClients: 3, title: '通用分类', icon: 'lucide:settings-2' } };
const personal = { id: '1303', name: 'CategoryConfig', path: '/time/my-categories', meta: { visibleClients: 3, title: '时迹分类', icon: 'mdi:tag-multiple-outline' } };
const administrator = { id: '1304', name: 'TimeTrackerCategoryAdmin', path: '/time/category-admin', meta: { visibleClients: 3, title: '时迹分类', icon: 'mdi:tag-multiple-outline' } };
const tracker = { id: '1301', name: 'TimeTracker', path: '/time/time-tracker', meta: { visibleClients: 3, title: '时迹' } };
function menus(admin = true) {
  return [
    { id: '1300', path: '/time', meta: { visibleClients: 3, title: '时间' }, children: [tracker] },
    { id: '2201', path: '/profile/category-management', meta: { visibleClients: 3, title: '分类管理', hideInMenu: true }, children: [general, personal] },
    ...(admin ? [{ id: '1900', path: '/system', meta: { visibleClients: 3, title: '系统管理' }, children: [administrator] }] : []),
  ];
}
async function setup(page, apiMock, admin = true, menuHandler) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'category-menu-fixture'));
  apiMock({
    'GET /api/user/info': ok({ id: '9223372036854775807', nickname: '模拟分类用户', roles: admin ? ['admin'] : ['user'] }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/message/unread-count': ok({ count: 0 }),
    'GET /api/menu/all': menuHandler || ok(menus(admin)),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/quick-nav/my': ok([]),
    'GET /api/quick-nav/candidates': ok([general, personal, tracker, ...(admin ? [administrator] : [])].map(row => ({ menuId: row.id, path: row.path, title: row.meta.title }))),
    'GET /api/menu/preferences': ok({ menus: menus(admin).map(group => ({ id: group.id, title: group.meta.title, children: group.children.map(row => ({ id: row.id, title: row.meta.title, children: [] })) })), hiddenMenuIds: [] }),
    'GET /api/userDictType/dictTypeEnum': ok([{ value: 'exercise_type', label: '运动分类' }]),
    'GET /api/userDictData/query': ok({ items: [{ id: '11', dictLabel: '模拟通用分类', dictType: 'exercise_type', isEnabled: 1, sortOrder: 0 }], total: 1 }),
    'GET /api/timeTrackerCategory/list': ok([{ id: '12', parentId: '0', name: '模拟个人时迹分类', userId: '9223372036854775807', isEnabled: 1 }]),
    'GET /api/timeTrackerCategory/hidden': ok([]),
    'GET /api/timeTrackerCategory/admin/list': ok([{ id: '13', parentId: '0', name: '模拟公共时迹分类', userId: '0', isEnabled: 1 }]),
  });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`我下分类管理双入口 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, apiMock, false);
    await page.goto('/#/pages/profile/index');
    await page.getByRole('button', { name: '分类管理', exact: true }).click();
    await expect(page).toHaveURL(/pages\/categories\/directory/);
    const entries = page.locator('.directory-row[role="button"]');
    await expect(entries).toHaveText(['通用分类', '时迹分类']);
    await expect(page.locator('html')).not.toHaveClass(/aio-page-motion/);
    await page.screenshot({ path: info.outputPath('category-directory.png') });
    await page.getByRole('button', { name: '通用分类', exact: true }).click();
    await expect(page.getByText('模拟通用分类', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑分类', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '时迹分类', exact: true }).click();
    await expect(page.getByText('模拟个人时迹分类', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑分类', exact: true })).toBeVisible();
  });
}
test('全部目录移除个人分类且管理员时迹分类在系统管理', async ({ page, apiMock }) => {
  await setup(page, apiMock);
  await page.goto('/#/pages/life/index');
  await expect(page.locator('.life-section').filter({ hasText: '时间' }).getByRole('button', { name: '时迹分类', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '通用分类', exact: true })).toHaveCount(0);
  await page.locator('.life-section').filter({ hasText: '系统管理' }).getByRole('button', { name: '时迹分类', exact: true }).click();
  await expect(page).toHaveURL(/pages\/categories\/index\?admin=1/);
  await expect(page.getByText('模拟公共时迹分类', { exact: true })).toBeVisible();
});
test('分类目录加载失败可重试且无授权菜单不补入口', async ({ page, apiMock }) => {
  let fail = true;
  await setup(page, apiMock, false, () => fail ? { json: { code: 1, message: '模拟目录加载失败' } } : ok([]));
  await page.goto('/#/pages/categories/directory');
  await expect(page.getByRole('alert')).toContainText('模拟目录加载失败');
  fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('暂无可用分类', { exact: true })).toBeVisible();
  await expect(page.locator('.directory-row[role="button"]')).toHaveCount(0);
});
