const { test, expect } = require('./support/test');
const { dashboardFixture } = require('./fixtures.js');
const { icons } = require('../../src/services/icons/catalog.generated.json');

async function expectMenuIcon(container, name, color) {
  const image = container.locator('.category-icon-image img');
  const body = icons[name].body.replaceAll('currentColor', color);
  await expect.poll(() => image.evaluate(img => {
    if (!img.complete || !img.naturalWidth) return '';
    return atob(img.src.split(',')[1]);
  })).toContain(body);
}

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
  const recordNames = ['笔记', '运动', '密码', '视频观看', '身体数据', '闪念', '阅读与观影记录的长期整理、年度统计、历史回顾与导出'];
  const menus = [
    { id: 'home', title: '主页', children: [] },
    { id: 'group-records', title: '记录', children: Array.from({ length: 24 }, (_, i) => ({
      id: '92233720368547758' + String(i).padStart(2, '0'),
      title: recordNames[i] || '记录功能' + i,
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
    if (path === '/api/menu/visuals') data = { menus: [
      { menuId: 'home', path: '/workspace', icon: 'lucide:house', iconColor: '#2563eb' },
      { menuId: 'group-records', path: '/record', icon: 'lucide:book-open', iconColor: '#8b5cf6' },
      { menuId: '9223372036854775800', path: '/record/memo', icon: 'mdi:note-text-outline', iconColor: null },
      { menuId: '9223372036854775801', path: '/record/exercise', icon: 'mdi:run', iconColor: null },
      { menuId: '9223372036854775802', path: '/record/password', icon: 'lucide:key-round', iconColor: '#b45309' },
      { menuId: '9223372036854775803', path: '/record/videoWatch', icon: 'ant-design:video-camera-outlined', iconColor: null },
      { menuId: '9223372036854775804', path: '/record/body-profile', icon: 'lucide:heart-pulse', iconColor: null },
      { menuId: '9223372036854775805', path: '/record/think', icon: 'lucide:lightbulb', iconColor: null },
      { menuId: 'group-tasks', path: '/task', icon: 'lucide:list-checks', iconColor: null },
      { menuId: '9223372036854775999', path: '/task/todo', icon: 'lucide:circle-check', iconColor: null },
    ], cards: {} };
    if (path === '/api/menu/preferences') {
      data = { menus, hiddenMenuIds: ['9223372036854775802'] };
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
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.getByRole('button', { name: '菜单显示', exact: true }).click();
    await expect(page).toHaveURL(/\/pages\/profile-settings\/preferences\?section=menus$/);
    const save = page.getByRole('button', { name: '保存', exact: true });
    await expect(save).toBeEnabled();
    const password = page.getByRole('switch', { name: '显示记录 / 密码', exact: true });
    await expect(password).toHaveAttribute('aria-checked', 'false');
    await expectMenuIcon(page.locator('.menu-option').filter({ has: page.getByRole('switch', { name: '显示主页', exact: true }) }), 'lucide:house', '#2563eb');
    await expectMenuIcon(page.getByRole('button', { name: '收起记录', exact: true }).locator('.category-icon').first(), 'lucide:book-open', '#8b5cf6');
    await expectMenuIcon(page.locator('.menu-option').filter({ has: password }), 'lucide:key-round', '#b45309');
    await screenshotReady(page, testInfo, 'menu-expanded.png');
    const notes = page.getByRole('switch', { name: '显示记录 / 笔记', exact: true });
    await notes.click();
    await expect(notes).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(/^已显示 \d+\/\d+$/)).toHaveCount(0);
    const exercise = page.getByRole('switch', { name: '显示记录 / 运动', exact: true });
    const notesBox = await notes.boundingBox();
    const exerciseBox = await exercise.boundingBox();
    if (width >= 768) {
      expect(exerciseBox.y).toBe(notesBox.y);
      expect(exerciseBox.x).toBeGreaterThan(notesBox.x);
    } else {
      expect(exerciseBox.x).toBe(notesBox.x);
      expect(exerciseBox.y).toBeGreaterThan(notesBox.y);
    }
    await page.getByRole('switch', { name: '显示任务 / 待办', exact: true }).scrollIntoViewIfNeeded();
    const saveBox = await save.boundingBox();
    expect(saveBox.y).toBeGreaterThanOrEqual(0);
    expect(saveBox.y + saveBox.height).toBeLessThan(844);
    const searchButton = page.getByRole('button', { name: '展开搜索', exact: true });
    const searchInput = page.getByRole('searchbox', { name: '搜索菜单', exact: true });
    await searchButton.click();
    await searchInput.fill('待办');
    await expect(page.getByRole('switch', { name: '显示任务 / 待办', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: '显示记录 / 笔记', exact: true })).toHaveCount(0);
    await save.click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0]).toEqual({ menuIds: ['9223372036854775802', '9223372036854775800'] });
    await searchButton.click();
    await searchInput.fill('无匹配菜单');
    await expect(page.getByText('未找到匹配菜单', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await page.getByRole('button', { name: '收起记录', exact: true }).click();
    await expect(page.getByRole('switch', { name: '显示记录 / 笔记', exact: true })).toHaveCount(0);
    await screenshotReady(page, testInfo, 'menu-groups.png');
    await page.goto('/#/pages/profile-settings/notifications');
    await expect(page.locator('.notification-group-title').first()).toBeVisible();
    await screenshotReady(page, testInfo, 'notification-groups.png');
    await page.goto('/#/pages/profile/index');
    await expect(page.getByRole('button', { name: '数据导出', exact: true })).toHaveCount(0);
    await screenshotReady(page, testInfo, 'profile.png');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '数据导出', exact: true })).toBeVisible();
    await screenshotReady(page, testInfo, 'settings-export.png');
  });
}
