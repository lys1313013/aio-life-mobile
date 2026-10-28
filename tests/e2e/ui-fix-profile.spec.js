const { test, expect } = require('./support/test');
const { dashboardFixture } = require('./fixtures.js');

async function screenshotReady(page, testInfo, name) {
  await expect(page.locator('uni-toast')).toBeHidden();
  if (await page.locator('uni-tabbar').count()) {
    const images = page.locator('uni-tabbar img');
    await expect(images).toHaveCount(4);
    for (const path of await images.evaluateAll(nodes => nodes.map(image => new URL(image.currentSrc || image.src, location.href).pathname)))
      expect(path).toMatch(/^\/static\/tabs\/[^/]+\.png$/);
    console.log('tabbar-resources', await images.evaluateAll(nodes => nodes.map(image => ({ path: new URL(image.currentSrc || image.src, location.href).pathname, complete: image.complete, width: image.naturalWidth }))));
    await expect.poll(() => images.evaluateAll(nodes => nodes.every(image => image.complete && image.naturalWidth > 0)), {
      message: '底栏所有图片必须完整加载且 naturalWidth > 0',
    }).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath(name) });
}

async function setup(page, theme) {
  const state = { writes: [] };
  const menus = [
    { id: 'group-records', title: '记录', children: Array.from({ length: 24 }, (_, i) => ({
      id: '92233720368547758' + String(i).padStart(2, '0'),
      title: i === 0 ? '笔记' : '记录功能' + i,
      children: [],
    })) },
    { id: 'group-tasks', title: '任务', children: [{ id: '9223372036854775999', title: '待办', children: [] }] },
  ];
  await page.emulateMedia({ colorScheme: theme });
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'profile-ui-fixture' };
    if (path === '/api/user/info') data = { id: '9007199254740993', nickname: '模拟账号' };
    if (path === '/api/menu/preferences') {
      data = { menus, hiddenMenuIds: [] };
      if (method === 'PUT') state.writes.push(route.request().postDataJSON());
    }
    if (path === '/api/notification/preferences') data = [
      { bizType: 'TODO', description: '待办提醒', visible: true, channels: [{ channel: 'STATION', isEnabled: 1 }, { channel: 'EMAIL', isEnabled: 0 }] },
      { bizType: 'GOAL', description: '目标提醒', visible: true, channels: [{ channel: 'STATION', isEnabled: 1 }, { channel: 'EMAIL', isEnabled: 0 }] },
    ];
    if (path === '/api/notification/channels/feishu') data = { configured: false, isEnabled: 0 };
    if (path === '/api/notification/channels/wechat-mini') data = { enabled: false, bound: false };
    await route.fulfill({ json: { code: 0, data: data ?? [] } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  return state;
}

for (const width of [390, 768, 1422]) for (const theme of ['light', 'dark']) {
  test('个人设置审查修复 ' + width + ' ' + theme, async ({ page }, testInfo) => {
    page.on('response', response => {
      if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith('/api/'))
        console.log('resource-error', response.status(), new URL(response.url()).pathname);
    });
    page.on('requestfailed', request => console.log('resource-failed', new URL(request.url()).pathname, request.failure()?.errorText));
    await page.setViewportSize({ width, height: 844 });
    const state = await setup(page, theme);
    await page.goto('/#/pages/profile/preferences?section=menus');
    const save = page.getByRole('button', { name: '保存', exact: true });
    await expect(save).toBeEnabled();
    await page.getByRole('switch', { name: '显示记录 / 笔记', exact: true }).click();
    await page.getByRole('switch', { name: '显示任务 / 待办', exact: true }).scrollIntoViewIfNeeded();
    const saveBox = await save.boundingBox();
    expect(saveBox.y).toBeGreaterThanOrEqual(0);
    expect(saveBox.y + saveBox.height).toBeLessThan(844);
    await page.locator('[aria-label="搜索菜单"] input').fill('待办');
    await expect(page.getByRole('switch', { name: '显示任务 / 待办', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: '显示记录 / 笔记', exact: true })).toHaveCount(0);
    await save.click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0]).toEqual({ menuIds: ['9223372036854775800'] });
    await page.locator('[aria-label="搜索菜单"] input').fill('无匹配菜单');
    await expect(page.getByText('未找到匹配菜单', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await page.getByRole('button', { name: '收起记录', exact: true }).click();
    await expect(page.getByRole('switch', { name: '显示记录 / 笔记', exact: true })).toHaveCount(0);
    await screenshotReady(page, testInfo, 'menu-groups.png');
    await page.goto('/#/pages/profile/notifications');
    await expect(page.locator('.notification-group-title').first()).toBeVisible();
    await screenshotReady(page, testInfo, 'notification-groups.png');
    await page.goto('/#/pages/profile/index');
    await expect(page.getByRole('button', { name: '数据导出', exact: true })).toBeVisible();
    await screenshotReady(page, testInfo, 'profile-export.png');
  });
}
