const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const { setupMapFixture } = require('./footprint-map-fixture.cjs');

async function setup(page, options = {}) {
  const state = await setupMapFixture(page, options);
  await page.route(`${test.info().project.use.baseURL}/api/**`, async route => {
    if (await state.handle(route)) return;
    const path = new URL(route.request().url()).pathname;
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'synthetic-footprint-token' };
    if (path === '/api/quick-nav/candidates') data = [{ menuId: '1512', path: '/record/life-footprints', title: '生活足迹', icon: 'mdi:map-marker-path' }];
    if (path === '/api/menu/preferences') data = { menus: [{ id: '1500', title: '记录', children: [{ id: '1512', title: '生活足迹', children: [] }] }], hiddenMenuIds: [] };
    if (path === '/api/user/info') data = { id: '7', nickname: '模拟用户', accountUsername: 'fixture' };
    return route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await page.getByRole('button', { name: '生活足迹', exact: true }).click();
  await expect(page).toHaveURL(/pages\/life-footprints\/index/);
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`生活足迹地图与表单 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const state = await setup(page);
    await expect(page.locator('.footprint-map-hit')).toHaveCount(1);
    await expect(page.locator('.footprint-detail')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('china.png'), fullPage: true });
    await page.getByRole('button', { name: '3条地点记录', exact: true }).click();
    await expect(page.locator('.group-record')).toHaveCount(3);
    await page.locator('.group-record').first().click();
    await expect(page.locator('.footprint-detail')).toContainText('丁香公寓');
    const sizes = await page.locator('.footprint-map-dot:not(.footprint-map-cluster)').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width));
    expect(sizes.every(size => size <= 10)).toBe(true);
    expect(await page.locator('.footprint-map-hit').first().evaluate(el => el.getBoundingClientRect().width)).toBe(44);
    await page.screenshot({ path: testInfo.outputPath('detail.png'), fullPage: true });
    const reads = state.reads;
    await page.getByRole('button', { name: '编辑生活足迹', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[aria-label$="精度"]')).toHaveCount(0);
    await dialog.locator('[aria-label="备注"] textarea').fill('');
    state.failSave = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('模拟保存失败');
    await expect(dialog.locator('[aria-label="地点"] input')).toHaveValue('丁香公寓');
    state.failSave = false;
    await dialog.locator('.ongoing-label').click();
    await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.at(-1).note).toBeNull(); expect(state.reads).toBe(reads);
    expect(state.writes.at(-1).endDate).toBe('9999-12-31');
    await expect(page.locator('.footprint-detail')).toContainText('至今');
    await expect(page.locator('.footprint-detail')).not.toContainText('9999');
    await page.getByRole('button', { name: '编辑生活足迹', exact: true }).click();
    await dialog.locator('.ongoing-label').click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('完整日期');
    await dialog.locator('uni-picker[aria-label="结束"]').click();
    const endDate = dialog.locator('uni-picker[aria-label="结束"] input[type="date"]');
    if (await endDate.count()) await endDate.fill('2020-06-30');
    else await page.locator('.uni-picker-action-confirm:visible').click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.at(-1).endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.writes.at(-1).endDate).not.toBe('9999-12-31');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('生活足迹旧搜索不覆盖新结果、手动选点与备注新增', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '新增生活足迹', exact: true }).click();
  const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[aria-label$="精度"]')).toHaveCount(0);
  const name = dialog.locator('[aria-label="地点"] input');
  await name.fill('旧搜索');
  await expect.poll(() => state.searches.includes('旧搜索')).toBe(true);
  await name.fill('新搜索');
  await expect(dialog.locator('.location-option')).toContainText('新搜索结果');
  await page.waitForTimeout(900);
  await expect(dialog.locator('.location-option')).toContainText('新搜索结果');
  await dialog.locator('.location-option').click();
  await expect(dialog.getByRole('button', { name: '确认位置', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '确认位置', exact: true }).click();
  await dialog.locator('[aria-label="备注"] textarea').fill('新的备注');
  await dialog.locator('uni-picker[aria-label="开始"]').click();
  const nativeDate = dialog.locator('uni-picker[aria-label="开始"] input[type="date"]');
  if (await nativeDate.count()) await nativeDate.fill('2020-08-01');
  else await page.locator('.uni-picker-action-confirm:visible').click();
  await expect(dialog.locator('uni-picker[aria-label="开始"]')).not.toContainText('请选择');
  // 地图选点会保持自己填写的名称，并将点选坐标用于逆解析。
  await dialog.locator('.footprint-h5-canvas').click({ position: { x: 90, y: 110 } });
  await expect(dialog).toContainText('位置已确认');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.records).toHaveLength(4);
  expect(state.writes.at(-1)).not.toHaveProperty('ongoing');
  expect(state.writes.at(-1)).not.toHaveProperty('requestKey');
  await expect(page.locator('.footprint-detail')).toContainText('至今');
  await expect(page.locator('.footprint-detail')).not.toContainText('9999');
  expect(state.writes.at(-1).startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(state.writes.at(-1).providerUid).toBeNull();
  expect(state.writes.at(-1)).toMatchObject({ note: '新的备注', placeName: '新搜索结果', endDate: '9999-12-31', coordinateSystem: 'GCJ02' });
});


for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`生活足迹加载空态及失败重试布局 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, { delay: 800, records: [] });
    const region = page.locator('.footprint-map-region');
    await expect(page.locator('.footprint-loading')).toBeVisible();
    const initial = await region.boundingBox();
    await expect(page.locator('.footprint-loading')).toHaveCount(0);
    expect((await region.boundingBox()).height).toBe(initial.height);
    await expect(page.locator('.footprint-map-hit')).toHaveCount(0);
    // 返回页面时重新读取，但保留此前地图与空态，不添加 loading 行。
    await page.getByRole('button', { name: '返回', exact: true }).click();
    state.failRead = true;
    await page.getByRole('button', { name: '生活足迹', exact: true }).click();
    await expect(page.locator('.footprint-loading')).toBeVisible();
    expect((await region.boundingBox()).height).toBe(initial.height);
    await expect(page.getByRole('alert')).toContainText('模拟读取失败');
    expect((await region.boundingBox()).y).toBe(initial.y);
    state.failRead = false;
    const { initialRecords } = require('./footprint-map-fixture.cjs');
    state.records = [initialRecords()[0]];
    state.records[0].placeName = '用于检查换行的较长住所名称'.repeat(3);
    state.records[0].note = '用于检查完整阅读的较长备注。'.repeat(80);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.locator('.footprint-map-hit')).toHaveCount(1);
    expect((await region.boundingBox()).height).toBe(initial.height);
    await page.locator('.footprint-map-hit').click();
    const detail = page.locator('.detail-scroll');
    expect(await detail.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
