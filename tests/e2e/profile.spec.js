const { test, expect } = require('./support/test');
const { dashboardFixture } = require('./fixtures.js');
const { retainedProfilePages } = require('./profile-navigation');
const themeColors = require('../../src/theme.json');
const darkSwitchColor = `rgb(${themeColors.dark.switchActiveColor.slice(1).match(/.{2}/g).map(value => parseInt(value, 16)).join(', ')})`;

async function setup(page) {
  const state = { unread: 3, failUnread: false, profile: { id: '9223372036854775807', accountUsername: 'fixture', nickname: '测试用户', email: 'fixture@example.com', introduction: '测试简介', avatarFileId: null }, binds: [], writes: [], failSave: false, failList: false, failDelete: false, expired: false, delay: 0 };
  await page.route(new URL('/api/**', test.info().project.use.baseURL).href, async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (state.expired) return route.fulfill({ status: 401, body: '未授权' });
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'profile-fixture' };
    if (path === '/api/user/info') data = state.profile;
    if (path === '/api/message/unread-count') {
      if (state.failUnread) return route.fulfill({ json: { code: 1, message: '未读消息加载失败' } });
      data = { count: state.unread };
    }
    if (path === '/api/users') {
      state.writes.push({ path, method, data: route.request().postDataJSON() });
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failSave) return route.fulfill({ json: { code: 1, message: '保存失败，请重试' } });
      Object.assign(state.profile, route.request().postDataJSON()); state.profile.avatarUrl = state.profile.avatarFileId ? '/avatar-fixture.png' : ''; data = null;
    }
    if (path === '/api/userbinds/list') {
      if (state.failList) return route.abort();
      data = state.binds;
    }
    if (path === '/api/userbinds') {
      const body = route.request().postDataJSON(); state.writes.push({ path, method, data: body });
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failSave) return route.fulfill({ json: { code: 1, message: '保存失败，请重试' } });
      if (method === 'POST') state.binds.push({ ...body, id: '9223372036854775806' });
      else Object.assign(state.binds.find(item => item.id === body.id), body);
      data = true;
    }
    if (path.startsWith('/api/userbinds/') && method === 'DELETE') {
      state.writes.push({ path, method });
      if (state.failDelete) return route.abort();
      state.binds = state.binds.filter(item => item.id !== path.split('/').at(-1)); data = true;
    }
    if (path === '/api/userbinds/douban/verify') data = { nickname: '模拟豆友' };
    if (data === undefined) return route.fulfill({ status: 404, body: path });
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await expect(page.getByText('测试用户', { exact: true })).toBeVisible();
  return state;
}

async function captureThemeMotion(page, snapshot, path) {
  // 暂停真实快照动画查看中间帧，连续切换时比较同一路径的正放／倒放。
  await page.waitForFunction(pseudoElement => {
    const animation = document.getAnimations().find(item => item.effect?.pseudoElement === pseudoElement);
    if (!animation) return false;
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) / 2;
    return true;
  }, snapshot);
  try {
    const frames = await page.evaluate(pseudoElement => {
      const effect = document.getAnimations().find(item => item.effect?.pseudoElement === pseudoElement).effect;
      return { clipPath: effect.getKeyframes().map(frame => frame.clipPath), duration: effect.getTiming().duration };
    }, snapshot);
    await expect(page.getByRole('switch', { name: '深色模式', exact: true })).toHaveCSS('opacity', '1');
    await page.screenshot({ path, fullPage: true });
    return frames;
  } finally {
    await page.evaluate(pseudoElement => document.getAnimations().find(item => item.effect?.pseudoElement === pseudoElement)?.play(), snapshot);
  }
}

for (const width of [390, 768, 1440]) {
  for (const system of ['light', 'dark']) {
    test(`我的主题和布局 ${width} ${system}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: system });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await setup(page);
      await expect(page.locator('.profile-menu')).toHaveCount(2);
      for (const name of Object.keys(retainedProfilePages)) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole('button', { name: '账号与安全', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '账号绑定', exact: true })).toBeVisible();
      await expect(page.locator('.account-card')).toHaveCount(0);
      await expect(page.locator('.profile-menu .menu-row')).toHaveCount(4);
      await expect(page.locator('.profile-shortcuts .shortcut-button')).toHaveCount(4);
      await expect(page.locator('.unread-badge')).toHaveText('3');
      for (const name of ['消息中心', '账号绑定', '首页卡片', '菜单显示']) {
        await expect(page.locator('.profile-shortcuts').getByRole('button', { name, exact: true })).toBeVisible();
      }
      for (const name of ['账号与安全', '消息通知', '分类管理', '设置']) {
        await expect(page.locator('.profile-menu').getByRole('button', { name, exact: true })).toBeVisible();
      }
      await expect(page.locator('.profile-edit')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '编辑资料', exact: true })).toHaveCount(1);
      for (const name of ['外观', '反馈', '关于', '退出登录']) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole('switch', { name: '深色模式', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `test-results/profile-shortcuts-${width}-${system}.png`, fullPage: true });
      await page.getByRole('button', { name: '设置', exact: true }).click();
      for (const name of ['反馈', '关于', '退出登录']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      }
      const darkModeSwitch = page.getByRole('switch', { name: '深色模式', exact: true });
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system === 'dark'));
      // 未手动选择前跟随系统；开关始终显示当前实际主题。
      await page.emulateMedia({ colorScheme: system === 'dark' ? 'light' : 'dark' });
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system !== 'dark'));
      await page.emulateMedia({ colorScheme: system });
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system === 'dark'));
      if (system === 'dark') {
        await expect(darkModeSwitch.locator('.mobile-switch-track')).toHaveCSS('background-color', darkSwitchColor);
      }
      await page.screenshot({ path: `test-results/settings-center-${width}-${system}.png`, fullPage: true });
      const selected = system === 'dark' ? '浅色' : '深色';
      const bg = selected === '深色' ? 'rgb(17, 18, 21)' : 'rgb(240, 242, 245)';
      await darkModeSwitch.click();
      const snapshot = selected === '深色' ? '::view-transition-old(root)' : '::view-transition-new(root)';
      const frames = await captureThemeMotion(page, snapshot, `test-results/theme-transition-${width}-${system}.png`);
      expect(frames.duration).toBe(800);
      const collapsed = frames.clipPath.map(value => value.startsWith('circle(0px '));
      expect(collapsed).toEqual(selected === '深色' ? [false, true] : [true, false]);
      for (const frame of frames.clipPath) expect(frame).toContain(`at ${width}px 0px)`);
      await expect(darkModeSwitch).toBeEnabled();
      await expect(page.locator('html')).not.toHaveClass(/aio-theme-transition/);
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(selected === '深色'));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', bg);
      await expect(page.locator('.page-navigation').last()).toHaveCSS('background-color', bg);
      // 不离开页面连续往返：第二次必须原路倒放，不能换圆心再做一次展开。
      await darkModeSwitch.click();
      const reverseSnapshot = selected === '深色' ? '::view-transition-new(root)' : '::view-transition-old(root)';
      const reverseFrames = await captureThemeMotion(page, reverseSnapshot, `test-results/theme-transition-return-${width}-${system}.png`);
      expect(reverseFrames.clipPath).toEqual([...frames.clipPath].reverse());
      await expect(darkModeSwitch).toBeEnabled();
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system === 'dark'));
      await darkModeSwitch.click();
      await expect(darkModeSwitch).toBeEnabled();
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(selected === '深色'));
      await page.getByRole('button', { name: '返回', exact: true }).last().click();
      await expect(page.locator('uni-tabbar .uni-tabbar')).toHaveCSS('background-color', selected === '深色' ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)');
      const menu = await page.locator('.menu-row').first().boundingBox();
      expect(menu.height).toBeLessThanOrEqual(60);
      await page.screenshot({ path: `test-results/profile-manual-${width}-${system}.png`, fullPage: true });
      await page.locator('.profile-intro').click();
      await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('测试用户');
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', bg);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/settings-${width}-${system}.png`, fullPage: true });
      await page.getByRole('button', { name: '返回', exact: true }).last().click();
      await page.getByRole('button', { name: '账号与安全', exact: true }).click();
      await expect(page.locator('.account-value').first()).toHaveText('fixture');
      await expect(page.locator('.account-value').last()).toHaveText('fixture@example.com');
      await page.screenshot({ path: `test-results/account-security-${width}-${system}.png`, fullPage: true });
      await page.getByRole('button', { name: '账号绑定', exact: true }).click();
      await page.getByRole('button', { name: '新增绑定', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('.modal-surface')).toHaveCSS('background-color', selected === '深色' ? 'rgba(28, 30, 34, 0.97)' : 'rgba(255, 255, 255, 0.97)');
      await page.screenshot({ path: `test-results/bindings-${width}-${system}.png`, fullPage: true });
      const box = await page.locator('.modal-panel').boundingBox();
      expect(box.width).toBeLessThanOrEqual(Math.min(480, width - 32));
      expect(box.y).toBeGreaterThan(0);
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '返回', exact: true }).last().click();
      await expect(page.getByText('账号与安全', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '返回', exact: true }).last().click();
      await page.reload();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(selected === '深色'));
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', bg);
      await page.getByRole('button', { name: '返回', exact: true }).last().click();
      await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', bg);
      await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await darkModeSwitch.click();
      await expect(darkModeSwitch).toBeEnabled();
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system === 'dark'));
      await expect(page.locator('html')).not.toHaveClass(/aio-theme-transition/);
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', system === 'dark' ? 'rgb(17, 18, 21)' : 'rgb(240, 242, 245)');
      // 手动选择保存后，系统主题变化不覆盖用户选择。
      await page.emulateMedia({ colorScheme: system === 'dark' ? 'light' : 'dark' });
      await expect(darkModeSwitch).toHaveAttribute('aria-checked', String(system === 'dark'));
      await expect(page.locator('.tab-page').last()).toHaveCSS('background-color', system === 'dark' ? 'rgb(17, 18, 21)' : 'rgb(240, 242, 245)');
      expect(errors).toEqual([]);
    });
  }
}

test('基本设置保存失败保留表单，重试保存并更新我的资料', async ({ page }) => {
  const state = await setup(page);
  await page.locator('.profile-name').click();
  const nickname = page.locator('[aria-label="昵称"] input');
  await expect(nickname).toHaveValue('测试用户');
  await nickname.fill('新的昵称');
  await page.locator('[aria-label="签名"] textarea').fill('新的简介');
  state.failSave = true; state.delay = 250;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存中…', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(nickname).toHaveValue('新的昵称');
  state.failSave = false;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveURL(/pages\/profile\/index/);
  await expect(page.getByText('新的昵称', { exact: true })).toBeVisible();
  expect(state.writes[1].data).toEqual({ nickname: '新的昵称', introduction: '新的简介', avatarFileId: null });
});

test('绑定加载失败重试、新增失败重试、编辑留空保留凭证、确认解绑失败重试', async ({ page }) => {
  const state = await setup(page); state.failList = true;
  await page.getByRole('button', { name: '账号与安全', exact: true }).click();
  await expect(page.locator('.account-value').first()).toHaveText('fixture');
  await expect(page.locator('.account-value').last()).toHaveText('fixture@example.com');
  await page.getByRole('button', { name: '账号绑定', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '新增绑定', exact: true })).toBeDisabled();
  state.failList = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('button', { name: '新增绑定', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请输入账号');
  await page.locator('[aria-label="账号或用户名"] input').fill('fixture-github');
  await page.locator('[aria-label="Access Token"] input').fill('fake-token-for-test');
  state.failSave = true; state.delay = 250;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.locator('[aria-label="账号或用户名"] input')).toHaveValue('fixture-github');
  state.failSave = false;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: '编辑GitHub绑定', exact: true }).click();
  await expect(page.locator('[aria-label="Access Token"] input')).toHaveValue('');
  await page.locator('[aria-label="账号或用户名"] input').fill('changed-github');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(state.writes.at(-1)).toEqual({ path: '/api/userbinds', method: 'PUT', data: { id: '9223372036854775806', platform: 'github', platformUsername: 'changed-github' } });
  await page.getByRole('button', { name: '解除GitHub绑定', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(state.writes.filter(item => item.method === 'DELETE')).toHaveLength(0);
  await page.getByRole('button', { name: '解除GitHub绑定', exact: true }).click();
  state.failDelete = true;
  await page.getByRole('button', { name: '解除绑定', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('changed-github', { exact: true })).toBeVisible();
  state.failDelete = false;
  await page.getByRole('button', { name: '解除绑定', exact: true }).click();
  await expect(page.getByText('还没有绑定账号')).toBeVisible();
});

test('资料页登录过期跳转登录', async ({ page }) => {
  const state = await setup(page); state.expired = true;
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
});

test('头像通过统一上传接口保存，携带鉴权且不改写邮箱', async ({ page }) => {
  const state = await setup(page);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
  let uploaded = false;
  await page.route('**/avatar-fixture.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route(new URL('/api/file/upload', test.info().project.use.baseURL).href, async route => {
    expect(route.request().headers().authorization).toBe('Bearer profile-fixture');
    expect(route.request().postDataBuffer().toString()).toContain('name="bizType"\r\n\r\navatar');
    uploaded = true;
    await route.fulfill({ json: { code: 0, data: { id: '0123456789abcdef0123456789abcdef', fileUrl: '/avatar-fixture.png' } } });
  });
  await page.locator('.profile-avatar').click();
  await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('测试用户');
  const chooser = page.waitForEvent('filechooser');
  await expect(page.getByRole('button', { name: '更换头像', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '从微信获取头像', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择头像图片', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '更换头像', exact: true }).click();
  await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.settings-avatar img')).toHaveAttribute('src', '/avatar-fixture.png');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveURL(/pages\/profile\/index/);
  expect(uploaded).toBe(true);
  expect(state.writes.at(-1).data.avatarFileId).toBe('0123456789abcdef0123456789abcdef');
  expect(state.writes.at(-1).data.avatar).toBeUndefined();
  expect(state.writes.at(-1).data.avatarUrl).toBeUndefined();
  expect(state.writes.at(-1).data.email).toBeUndefined();
});

test('微信读书新建必填密钥，编辑不回显且留空保留', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '账号与安全', exact: true }).click();
  await expect(page.locator('.account-value').first()).toHaveText('fixture');
  await expect(page.locator('.account-value').last()).toHaveText('fixture@example.com');
  await page.getByRole('button', { name: '账号绑定', exact: true }).click();
  await page.getByRole('button', { name: '新增绑定', exact: true }).click();
  await page.locator('uni-picker').click();
  await page.locator('.uni-picker-select .uni-picker-item').getByText('微信读书', { exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请输入微信读书 API Key');
  await page.locator('[aria-label="API Key"] input').fill('wrk-fixture');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(state.writes.at(-1).data).toEqual({ platform: 'weread', platformUsername: '', accessToken: 'wrk-fixture' });
  await page.getByRole('button', { name: '编辑微信读书绑定', exact: true }).click();
  await expect(page.locator('[aria-label="API Key"] input')).toHaveValue('');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(state.writes.at(-1).data.accessToken).toBeUndefined();
});


test('未读角标返回时刷新、零值隐藏、失败保留旧值并局部重试', async ({ page }) => {
  const state = await setup(page);
  await expect(page.locator('.unread-badge')).toHaveText('3');
  state.unread = 123;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.unread-badge')).toHaveText('99+');
  state.failUnread = true;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('未读消息加载失败');
  await expect(page.locator('.unread-badge')).toHaveText('99+');
  state.failUnread = false;
  state.unread = 0;
  await page.getByRole('button', { name: '重试未读消息', exact: true }).click();
  await expect(page.locator('.unread-badge')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
