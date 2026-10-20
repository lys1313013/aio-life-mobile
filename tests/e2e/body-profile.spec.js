const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

const empty = {
  id: null, version: 0, updateTime: null, bmi: null,
  gender: null, heightCm: null, weightKg: null, bodyFatPercent: null,
  shoulderWidthCm: null, chestCm: null, upperArmCm: null, forearmCm: null,
  waistCm: null, hipCm: null, thighCm: null, calfCm: null, inseamCm: null,
  measurementSide: null, armState: null, topSize: null, trousersSize: null,
  shoeSize: null, shoeSystem: null,
};
const fixture = { ...empty, id: '9223372036854775807', version: 1, updateTime: '2026-10-20T12:00:00', gender: 'male', heightCm: 178, weightKg: 72, bmi: 22.7, bodyFatPercent: 18.5, shoulderWidthCm: 45, chestCm: 94, upperArmCm: 32, forearmCm: 27, waistCm: 80, hipCm: 96, thighCm: 54, calfCm: 36, shoeSize: '42', shoeSystem: 'EU', topSize: 'L', trousersSize: 'W30', inseamCm: 81 };

async function setup(page) {
  const state = { profile: { ...fixture }, writes: [], reads: 0, failSave: false, failRead: false, delay: 0 };
  await page.route(`${test.info().project.use.baseURL}/api/**`, async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/body-profile') {
      if (req.method() === 'PUT') {
        const data = req.postDataJSON(); state.writes.push(data);
        if (state.failSave) return route.fulfill({ json: { code: 1, message: '模拟保存失败' } });
        expect(data.version).toBe(state.profile.version);
        for (const field of ['id', 'bmi', 'userId', 'updateTime']) expect(data).not.toHaveProperty(field);
        state.profile = { ...state.profile, ...data, id: state.profile.id || fixture.id, version: data.version + 1, updateTime: '2026-10-20T12:01:00' };
        state.profile.bmi = data.heightCm && data.weightKg ? Number((data.weightKg / (data.heightCm / 100) ** 2).toFixed(1)) : null;
      } else {
        state.reads++;
        if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
        if (state.failRead) return route.fulfill({ json: { code: 1, message: '模拟读取失败' } });
      }
      return route.fulfill({ json: { code: 0, data: state.profile } });
    }
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'body-profile-fixture' };
    if (path === '/api/user/info') data = { id: '7', nickname: '模拟用户', accountUsername: 'fixture' };
    return route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`身体档案当前值、清空和失败恢复 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/body-profile/index');
    await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('22.7');
    await expect(page.getByRole('combobox', { name: '性别' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true });
    const figure = page.locator('.body-figure');
    await expect(figure.locator('img')).toHaveJSProperty('complete', true);
    await page.getByRole('button', { name: '编辑上臂围', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[aria-label="上臂围（cm）"] input').fill('33.5');
    state.failSave = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('模拟保存失败');
    await expect(dialog.locator('[aria-label="上臂围（cm）"] input')).toHaveValue('33.5');
    await page.screenshot({ path: testInfo.outputPath('editor-error.png'), fullPage: true });
    state.failSave = false;
    const reads = state.reads;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.profile.upperArmCm).toBe(33.5);
    expect(state.reads).toBe(reads);
    await page.getByRole('button', { name: '编辑体重', exact: true }).click();
    await page.locator('[aria-label="体重（kg）"] input').fill('80');
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('25.2');
    await page.getByRole('button', { name: '编辑身高', exact: true }).click();
    await page.locator('[aria-label="身高（cm）"] input').fill('');
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('—');
    expect(state.profile.heightCm).toBeNull();
    await page.getByRole('button', { name: '编辑身体档案', exact: true }).click();
    await expect(page.locator('[aria-label="性别"]')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '穿戴尺码与身体长度', exact: true }).click();
    await expect(page.getByText('42 码', { exact: true })).toBeVisible();
  });
}

test('空态及延迟读取布局稳定，首次失败禁编辑并可重试', async ({ page }) => {
  const state = await setup(page);
  state.failRead = true;
  await page.goto('/#/pages/body-profile/index');
  await expect(page.getByRole('alert')).toContainText('模拟读取失败');
  await expect(page.getByRole('button', { name: '编辑身体档案', exact: true })).toBeDisabled();
  state.failRead = false; state.delay = 600; state.profile = { ...empty };
  await page.getByRole('button', { name: '重试', exact: true }).click();
  const first = await page.locator('.body-anatomy').boundingBox();
  await expect(page.getByRole('button', { name: '编辑身体档案', exact: true })).toBeEnabled();
  const loaded = await page.locator('.body-anatomy').boundingBox();
  expect(first.height).toBe(loaded.height);
  await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('—');
  await page.getByRole('button', { name: '编辑上臂围', exact: true }).click();
  await page.locator('[aria-label="上臂围（cm）"] input').fill('32');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  expect(state.profile.id).toBe(fixture.id);
  expect(state.profile.version).toBe(1);
  expect(state.profile.upperArmCm).toBe(32);
});

test('从个人中心可进入身体档案', async ({ page }) => {
  await setup(page);
  await page.goto('/#/pages/profile/index');
  await page.getByRole('button', { name: '身体档案', exact: true }).click();
  await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('22.7');
});

test('编辑中切换性别、测量口径和鞋码类型，不改写其他身体数据', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await setup(page);
  await page.goto('/#/pages/body-profile/index');
  await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('22.7');
  const originalFigure = await page.locator('.body-figure img').getAttribute('src');
  await page.getByRole('button', { name: '编辑身体档案', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of [['性别', '女'], ['四肢围度测量侧别', '右侧'], ['上臂测量状态', '屈臂收缩']]) {
    await dialog.locator(`uni-picker[aria-label="${label}"]`).click();
    await page.locator('.uni-picker-select:visible').getByText(value, { exact: true }).click();
  }
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.profile).toMatchObject({ gender: 'female', measurementSide: 'right', armState: 'flexed', heightCm: 178, weightKg: 72 });
  expect(await page.locator('.body-figure img').getAttribute('src')).not.toBe(originalFigure);
  await page.getByRole('button', { name: '穿戴尺码与身体长度', exact: true }).click();
  await page.getByRole('button', { name: '编辑鞋码', exact: true }).click();
  await page.locator('uni-picker[aria-label="鞋码类型"]').click();
  await page.locator('.uni-picker-select:visible').getByText('美码', { exact: true }).click();
  await page.locator('[aria-label="鞋码"] input').fill('9');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('美码 9', { exact: true })).toBeVisible();
  expect(state.profile).toMatchObject({ shoeSize: '9', shoeSystem: 'US', heightCm: 178 });
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`身体档案禁用指标保持透明 ${width} 应用${theme} 系统相反主题`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
    await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), theme);
    const state = await setup(page);
    state.failRead = true; state.delay = 700;
    await page.goto('/#/pages/body-profile/index');
    const height = page.getByRole('button', { name: '编辑身高', exact: true });
    const shoulder = page.getByRole('button', { name: '编辑肩宽', exact: true });
    const transparent = 'rgba(0, 0, 0, 0)';
    const background = theme === 'dark' ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)';
    await expect(page.locator('.body-card')).toHaveCSS('background-color', background);
    await expect(page.locator('.body-card')).toHaveAttribute('aria-busy', 'true');
    for (const metric of [height, shoulder]) {
      await expect(metric).toHaveAttribute('disabled', 'true');
      await expect(metric).toHaveCSS('background-color', transparent);
    }
    await expect(page.getByRole('alert')).toContainText('模拟读取失败');
    await page.getByRole('button', { name: '穿戴尺码与身体长度', exact: true }).click();
    for (const metric of [height, shoulder, ...await page.locator('.clothing-item').all()]) {
      await expect(metric).toHaveAttribute('disabled', 'true');
      await expect(metric).toHaveCSS('background-color', transparent);
    }
    const errorColor = await page.locator('.body-error-text').evaluate(node => getComputedStyle(node).color);
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
      .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const [lighter, darker] = [luminance(errorColor), luminance(background)].sort((a, b) => b - a);
    expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath('read-error.png'), fullPage: true });
    state.failRead = false; state.profile = { ...empty };
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(height).toHaveAttribute('disabled', 'true');
    await expect(height).toHaveCSS('background-color', transparent);
    await expect(height).not.toHaveAttribute('disabled', 'true');
    await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('—');
    await expect(shoulder).toHaveCSS('background-color', transparent);
    await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });
    state.delay = 0; state.profile = { ...fixture };
    await page.reload();
    await expect(page.locator('[data-testid="body-bmi"]')).toHaveText('22.7');
    await expect(height).toHaveCSS('background-color', transparent);
    await page.screenshot({ path: testInfo.outputPath('loaded.png'), fullPage: true });
  });
}
