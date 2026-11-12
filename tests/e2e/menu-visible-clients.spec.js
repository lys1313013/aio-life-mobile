const { test, expect } = require('./support/test');
const ok = data => ({ json: { code: 0, message: null, data } });
const id = '9223372036854775807';

async function setup(page, apiMock) {
  const state = { fail: false, writes: [], menu: {
    id, parentId: '0', name: 'FixtureMenu', path: '/fixture/menu', component: 'fixture/index',
    visibleClients: 1, sortOrder: 0,
    meta: { title: '模拟菜单', icon: 'lucide:book', keepAlive: true },
  } };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'synthetic-menu-clients'));
  apiMock({
    'GET /api/user/info': ok({ id: '7', nickname: '模拟管理员', roles: ['admin'] }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/message/unread-count': ok({ count: 0 }),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/menu/admin/tree': () => ok([state.menu]),
    'GET /api/menu/admin/role-options': ok(['admin', 'user']),
    [`PUT /api/menu/admin/${id}`]: request => {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.fail) return { json: { code: 1, message: '模拟保存失败' } };
      Object.assign(state.menu, body);
      return ok(state.menu);
    },
  });
  await page.goto('/#/pages/admin/index?kind=menus');
  await page.getByRole('button', { name: '编辑模拟菜单', exact: true }).click();
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`展示端配置 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, apiMock);
    const dialog = page.getByRole('dialog', { name: '菜单管理', exact: true });
    const web = dialog.getByRole('switch', { name: 'Web 菜单展示', exact: true });
    const mobile = dialog.getByRole('switch', { name: '手机端菜单展示', exact: true });
    await expect(web).toHaveAttribute('aria-checked', 'true');
    await expect(mobile).toHaveAttribute('aria-checked', 'false');
    await mobile.click();
    await expect(mobile).toHaveAttribute('aria-checked', 'true');
    await expect(dialog).toBeInViewport();
    await page.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({ path: info.outputPath('menu-visible-clients.png') });
    state.fail = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('模拟保存失败');
    await expect(mobile).toHaveAttribute('aria-checked', 'true');
    state.fail = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.at(-1)).toMatchObject({ visibleClients: 3 });
    await page.getByRole('button', { name: '编辑模拟菜单', exact: true }).click();
    await web.click();
    await mobile.click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.at(-1)).toMatchObject({ visibleClients: 0 });
    await page.getByRole('button', { name: '模拟菜单更多操作', exact: true }).click();
    await expect(page.getByRole('switch', { name: '模拟菜单 Web 展示', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: '模拟菜单 手机端展示', exact: true })).toHaveAttribute('aria-checked', 'false');
  });
}
