const { test, expect } = require('./support/test');
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
      const before = await editor.boundingBox();
      await page.screenshot({ path: info.outputPath('options-loading.png') });
      pending.release();
      await editor.getByRole('button', { name: '重试设备选项', exact: true }).click({ trial: true });
      await expect(name).toHaveValue('字典加载期间输入的名称');
      failed = false;
      await editor.getByRole('button', { name: '重试设备选项', exact: true }).click();
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
      await expect(name).toHaveValue('字典加载期间输入的名称');
      expect(Math.abs((await editor.boundingBox()).height - before.height)).toBeLessThan(2);
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
