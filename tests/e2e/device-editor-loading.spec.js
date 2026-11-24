const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');
const { stableBox } = require('./support/geometry');
const { waitForMotion } = require('./support/motion');
const ok = data => ({ json: { code: 0, message: null, data } });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const id = '9223372036854775807';
const device = { id, name: '模拟设备长名称', spec: '模拟配置和容量', type: '81', status: '1', purchasePrice: 100, remark: '需要保留的备注', fileId: '' };
const types = { dictDetailList: [{ id: '81', dictLabel: '模拟电脑' }] };
const statuses = { dictDetailList: [{ label: '使用中', value: '1' }] };
function fixtures() {
  return {
    'GET /api/home/cards': ok([{ cardKey: 'section.device', title: '我的设备', group: 'section', isEnabled: 1, sortOrder: 0 }]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/user/info': ok({ id: '1', nickname: '模拟用户' }),
    'GET /api/dashboard/tasks': ok([]),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/all': ok([{ path: '/my-hub/device', meta: { menuId: 'device' } }]),
    'GET /api/quick-nav/candidates': ok([{ path: '/my-hub/device' }]),
    'GET /api/home/sections/device': ok({ items: [{ id, name: device.name, usageDays: 10, dailyCost: 10 }], refreshInterval: 600 }),
    ['GET /api/device/' + id]: ok(device),
    'GET /api/device/query': ok({ items: [device], total: 1 }),
    'GET /api/userDictType/getByDictType': ok(types),
    'GET /api/sysDictType/getByDictType': ok(statuses),
  };
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`设备字典慢响应不阻塞表单，失败重试保留输入 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'device-loading-fixture'));
    const pending = gate(); let failed = true;
    apiMock({ ...fixtures(), 'GET /api/userDictType/getByDictType': async request => {
      expect(new URL(request.url()).searchParams.get('dictType')).toBe('device_type');
      await pending.promise;
      return failed ? { json: { code: 1, message: '模拟字典失败' } } : ok(types);
    } });
    try {
      await page.goto('/#/pages/home/index');
      await page.getByRole('button', { name: '查看' + device.name, exact: true }).click();
      const editor = page.getByRole('dialog', { name: '编辑设备', exact: true });
      const name = editor.getByRole('textbox', { name: '名称', exact: true });
      await expect(name).toHaveValue(device.name);
      await expect(editor.getByRole('status', { name: '正在加载设备选项', exact: true })).toBeVisible();
      await name.fill('字典加载期间输入的名称');
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
      // 等待真实开场动画结束后比较状态切换的布局，不关闭动画或固定 sleep。
      await editor.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
      const before = await stableBox(editor);
      await page.screenshot({ path: info.outputPath('options-loading.png') });
      pending.release();
      await editor.getByRole('button', { name: '重试设备选项', exact: true }).click({ trial: true });
      await expect(name).toHaveValue('字典加载期间输入的名称');
      failed = false;
      await editor.getByRole('button', { name: '重试设备选项', exact: true }).click();
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
      await expect(name).toHaveValue('字典加载期间输入的名称');
      expect(Math.abs((await stableBox(editor)).height - before.height)).toBeLessThan(2);
      await page.screenshot({ path: info.outputPath('options-ready.png') });
      await editor.getByRole('button', { name: '取消', exact: true }).click();
      await expect(editor).toHaveCount(0);
    } finally { pending.release(); }
  });
}
test('设备列表编辑复用字典，不重复请求', async ({ page, apiMock }) => {
  let calls = 0;
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'device-list-fixture'));
  apiMock({ ...fixtures(), 'GET /api/userDictType/getByDictType': () => { calls++; return ok(types); } });
  await page.goto('/#/pages/goods/devices');
  await page.getByRole('button', { name: '编辑设备', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑设备', exact: true });
  await expect(editor.getByRole('textbox', { name: '名称', exact: true })).toHaveValue(device.name);
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(calls).toBe(1);
});
for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`设备搜索点外收起并保留分类点击 ${width} ${colorScheme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'device-search-fixture'));
    const phone = { ...device, id: '82', type: '82', name: '模拟手机设备', spec: '模拟手机配置' };
    apiMock({
      ...fixtures(),
      'GET /api/device/query': ok({ items: [device, phone], total: 2 }),
      'GET /api/userDictType/getByDictType': ok({
        dictDetailList: [...types.dictDetailList, { id: '82', dictLabel: '模拟手机' }],
      }),
    });
    await page.goto('/#/pages/goods/devices');
    const pager = page.locator('.device-pager');
    const activePage = page.locator('.device-page-active');
    const toggle = page.getByRole('button', { name: '展开搜索', exact: true });
    const search = page.getByRole('searchbox', { name: '搜索设备', exact: true });
    await expect(activePage.getByText(device.name, { exact: true })).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(search).toHaveCount(0);
    const before = await stableBox(pager);

    await toggle.click();
    await expect(search).toBeFocused();
    await waitForMotion(page);
    const expanded = await stableBox(pager);
    expect(expanded.y).toBeGreaterThan(before.y);
    expect(Math.abs(expanded.y + expanded.height - before.y - before.height)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath('device-search-open.png') });
    await search.click();
    await search.fill('模拟配置和容量');
    await expect(activePage.getByText(phone.name, { exact: true })).toHaveCount(0);

    const phoneTab = page.getByRole('button', { name: '模拟手机', exact: true });
    await phoneTab.click();
    await expect(phoneTab).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(search).toHaveCount(0);
    await expect(activePage.getByText(phone.name, { exact: true })).toBeVisible();
    await waitForMotion(page);
    const collapsed = await stableBox(pager);
    expect(Math.abs(collapsed.y - before.y)).toBeLessThan(2);
    expect(Math.abs(collapsed.height - before.height)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath('device-search-closed.png') });
  });
}
for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`设备下拉只显示顶部刷新提示，重试保留列表 ${width} ${colorScheme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'device-refresh-fixture'));
    const items = colorScheme === 'light' || width === 390
      ? [device, { ...device, id: '82', name: '模拟平板设备' }]
      : width === 768 ? [device] : [];
    let hold = gate(), fail = false;
    apiMock({ ...fixtures(), 'GET /api/device/query': async () => {
      await hold.promise;
      return fail ? { json: { code: 1, message: '模拟设备刷新失败' } } : ok({ items, total: items.length });
    } });
    try {
      await page.goto('/#/pages/goods/devices');
      const active = page.locator('.device-page-active');
      const content = items.length ? active.getByText(device.name, { exact: true }) : active.getByText('暂无记录', { exact: true });
      const scroller = '.category-pager-scroll:has(.device-page-active)';
      const nativeIndicator = page.locator(scroller).locator('.uni-scroll-view-refresher');
      const progress = page.getByRole('status', { name: '正在更新设备', exact: true });
      await expect(active.getByRole('status', { name: '正在加载总资产' })).toBeVisible();
      hold.release();
      await expect(content).toBeVisible();
      const geometry = () => active.evaluate(el => {
        const metrics = el.querySelector('.metrics').getBoundingClientRect();
        const list = el.querySelector('.page-state').getBoundingClientRect();
        return [metrics.height, list.top - metrics.top, list.height];
      });
      const before = await geometry();
      hold = gate();
      fail = true;
      await pullDown(page, scroller);
      await expect(active).toHaveAttribute('aria-busy', 'true');
      await expect(nativeIndicator).toBeVisible();
      await expect(active.locator('.loading-indicator, .content-skeleton')).toHaveCount(0);
      await expect(progress).toHaveCount(0);
      await expect(content).toBeVisible();
      expect(await geometry()).toEqual(before);
      await page.screenshot({ path: info.outputPath('device-pull-refresh.png') });
      hold.release();
      await expect(active.getByRole('alert')).toHaveAccessibleName('更新失败：模拟设备刷新失败');
      await expect(nativeIndicator).toHaveCSS('height', '0px');
      hold = gate();
      fail = false;
      await active.getByRole('button', { name: '重试', exact: true }).click();
      await expect(progress).toBeVisible();
      await expect(content).toBeVisible();
      expect(await geometry()).toEqual(before);
      await page.screenshot({ path: info.outputPath('device-retry.png') });
      hold.release();
      await expect(active).toHaveAttribute('aria-busy', 'false');
      await expect(progress).toHaveCount(0);
      await expect(active.getByRole('alert')).toHaveCount(0);
    } finally { hold.release(); }
  });
}
test('详情慢请求显示表单骨架，关闭后旧响应不重开，减少动态效果不缩放', async ({ page, apiMock }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'device-detail-fixture'));
  const pending = gate();
  apiMock({ ...fixtures(), ['GET /api/device/' + id]: async () => { await pending.promise; return ok(device); } });
  try {
    await page.goto('/#/pages/home/index');
    await page.getByRole('button', { name: '查看' + device.name, exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑设备', exact: true });
    await expect(editor.getByRole('status', { name: '正在加载设备详情', exact: true })).toBeVisible();
    expect(await editor.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await expect(editor.locator('.form-skeleton-line').first()).toHaveCSS('animation-name', 'none');
    await page.screenshot({ path: info.outputPath('detail-skeleton.png') });
    await editor.getByRole('button', { name: '关闭', exact: true }).click();
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/device/' + id);
    pending.release();
    await (await response).finished();
    await expect(editor).toHaveCount(0);
    await page.getByRole('button', { name: '查看' + device.name, exact: true }).click();
    await expect(editor.getByRole('textbox', { name: '名称', exact: true })).toHaveValue(device.name);
  } finally { pending.release(); }
});
