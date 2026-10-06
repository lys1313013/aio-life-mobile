const { test, expect } = require('@playwright/test');
const { picker } = require('./qa-domains-ui');
const fileId = 'a'.repeat(32), uploadedId = 'b'.repeat(32), id = '9223372036854775807', bankId = '9007199254740999';
const cover = { id, bankId, name: '模拟银行经典储蓄卡面', bankName: '模拟银行', fileId, cardType: 'debit', sourceUrl: 'https://example.com/card', isEnabled: 1, sortOrder: 0, usageCount: 0 };
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" rx="32" fill="#31567a"/><text x="55" y="110" fill="white" font-size="45">DEMO BANK</text><text x="55" y="490" fill="#d5e3ef" font-size="30">PUBLIC CARD COVER</text></svg>';
async function setup(page, admin = true) {
  const state = { rows: [cover, { ...cover, id: '2', name: '模拟银行信用卡面（已有引用）', usageCount: 3, cardType: 'credit', sortOrder: 1 }], failSave: false, failDelete: false, failToggle: false, failList: false, calls: [], uploads: [] };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'cover-admin-fixture'));
  await page.route('**/api/user/info', route => route.fulfill({ json: { code: 0, data: { id: '1', nickname: '模拟管理员', roles: admin ? ['admin'] : ['user'] } } }));
  for (const path of ['/menu/list', '/menu/all', '/auth/secondary-lock/menus']) await page.route('**/api' + path, route => route.fulfill({ json: { code: 0, data: [] } }));
  await page.route('**/api/file/preview/*', route => route.fulfill({ contentType: 'image/svg+xml', body: image }));
  await page.route('**/api/system/bank-card-covers{,/**}', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname, method = request.method();
    const ok = data => route.fulfill({ json: { code: 0, data } });
    const fail = message => route.fulfill({ json: { code: 1, result: message } });
    if (pathname.endsWith('/banks')) return ok([{ id: bankId, name: '模拟银行', enabled: true }, { id: '8', name: '停用银行', enabled: false }]);
    if (pathname.endsWith('/upload')) { state.uploads.push(request.postDataBuffer()); return ok({ id: uploadedId }); }
    if (method === 'GET') return state.failList ? fail('模拟列表失败') : ok(state.rows);
    const body = method === 'DELETE' ? null : request.postDataJSON();
    state.calls.push({ pathname, method, body });
    if (method === 'DELETE') {
      if (state.failDelete) return fail('模拟删除失败');
      state.rows = state.rows.filter(row => !pathname.endsWith('/' + row.id)); return ok(null);
    }
    if (pathname.endsWith('/enabled')) {
      if (state.failToggle) return fail('模拟启停失败');
      const rowId = pathname.split('/').at(-2), row = { ...state.rows.find(item => item.id === rowId), ...body };
      state.rows = state.rows.map(item => item.id === rowId ? row : item); return ok(row);
    }
    if (state.failSave) return fail('模拟保存失败');
    const rowId = method === 'POST' ? '9007199254740998' : pathname.split('/').at(-1);
    const row = { ...cover, ...state.rows.find(item => item.id === rowId), ...body, id: rowId };
    state.rows = [...state.rows.filter(item => item.id !== rowId), row]; return ok(row);
  });
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`公共卡面管理编辑与引用约束 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/admin/bank-card-covers');
    await expect(page.getByRole('button', { name: '编辑' + cover.name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '删除模拟银行信用卡面（已有引用）', exact: true })).toBeDisabled();
    await page.screenshot({ path: `artifacts/bank-card-covers-admin/${width}-${theme}-list.png`, fullPage: true });
    await page.getByRole('button', { name: '编辑模拟银行信用卡面（已有引用）', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑公共卡面', exact: true });
    await expect(editor.locator('uni-picker[aria-label="银行"]')).toHaveAttribute('disabled', 'true');
    await expect(editor.locator('uni-picker[aria-label="银行卡类型"]')).toHaveAttribute('disabled', 'true');
    await page.screenshot({ path: `artifacts/bank-card-covers-admin/${width}-${theme}-editor.png`, fullPage: true });
    await editor.getByRole('textbox', { name: '卡面名称', exact: true }).fill('模拟修改后卡面');
    state.failSave = true;
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveText('模拟保存失败');
    await expect(editor.getByRole('textbox', { name: '卡面名称', exact: true })).toHaveValue('模拟修改后卡面');
    state.failSave = false;
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(state.calls.at(-1).body.bankId).toBe(bankId);
    expect(state.calls.at(-1).body).not.toHaveProperty('usageCount');
    await page.getByRole('textbox', { name: '搜索卡面', exact: true }).fill('修改后');
    await expect(page.locator('.cover-item')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('公共卡面PNG选择、画布调整、管理员上传与新增闭环', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page);
  await page.goto('/#/pages/admin/bank-card-covers');
  await page.getByRole('button', { name: '新增公共卡面', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新增公共卡面', exact: true });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('卡面名称');
  await editor.getByRole('textbox', { name: '卡面名称', exact: true }).fill('模拟上传新卡面');
  await picker(page, '银行', '模拟银行');
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 350; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#31567a'; ctx.fillRect(0, 0, 500, 350); return canvas.toDataURL('image/png').split(',')[1]; });
  const fileChooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '上传卡面', exact: true }).click();
  await (await fileChooser).setFiles({ name: 'fixture-card.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(editor.getByRole('button', { name: '确认上传', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await picker(page, '图片适配', '填满');
  await page.screenshot({ path: 'artifacts/bank-card-covers-admin/390-upload-crop.png', fullPage: true });
  await editor.getByRole('button', { name: '确认上传', exact: true }).click();
  await expect(editor.getByRole('button', { name: '更换卡面', exact: true })).toBeVisible();
  expect(state.uploads).toHaveLength(1);
  const uploaded = state.uploads[0];
  const pngStart = uploaded.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(pngStart).toBeGreaterThan(0);
  expect(uploaded.readUInt32BE(pngStart + 16)).toBe(960);
  expect(uploaded.readUInt32BE(pngStart + 20)).toBe(605);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(state.calls.at(-1).method).toBe('POST');
  expect(state.calls.at(-1).body.fileId).toBe(uploadedId);
  await expect(page.getByRole('button', { name: '编辑模拟上传新卡面', exact: true })).toBeVisible();
});

test('列表、启停、删除失败保留内容并可重试；非管理员不请求业务数据', async ({ page }) => {
  const state = await setup(page); state.failList = true;
  await page.goto('/#/pages/admin/bank-card-covers');
  await expect(page.getByText('模拟列表失败', { exact: true })).toBeVisible();
  state.failList = false; await page.getByRole('button', { name: '重试', exact: true }).click();
  state.failToggle = true; await page.getByRole('button', { name: '停用' + cover.name, exact: true }).click();
  await expect(page.getByText('模拟启停失败', { exact: true })).toBeVisible();
  state.failToggle = false; await page.getByRole('button', { name: '重试状态更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '启用' + cover.name, exact: true })).toBeVisible();
  state.failDelete = true; await page.getByRole('button', { name: '删除' + cover.name, exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '删除' + cover.name, exact: true });
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await expect(confirm.getByRole('alert')).toHaveText('模拟删除失败');
  state.failDelete = false; await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑' + cover.name, exact: true })).toHaveCount(0);
});

test('非管理员不能加载或新增公共卡面', async ({ page }) => {
  await setup(page, false);
  let businessRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/system/bank-card-covers')) businessRequests++; });
  await page.goto('/#/pages/admin/bank-card-covers');
  await expect(page.getByText('当前账号没有管理员权限', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增公共卡面', exact: true })).toHaveCount(0);
  expect(businessRequests).toBe(0);
});

test('卡面预览失败重试恢复图片且不误开编辑弹窗', async ({ page }) => {
  await setup(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failed = true;
  await page.route('**/api/file/preview/' + fileId, route => failed
    ? route.fulfill({ status: 500, json: { code: 1, message: '模拟图片失败' } })
    : route.fulfill({ contentType: 'image/svg+xml', body: image }));
  await page.goto('/#/pages/admin/bank-card-covers');
  const item = page.locator('.cover-item').first();
  await expect(item.getByText('卡面加载失败', { exact: true })).toBeVisible();
  failed = false;
  await item.getByRole('button', { name: '重试卡面', exact: true }).click();
  await expect(item.locator('.cover-image')).toBeVisible();
  await expect(item.getByText('卡面加载失败', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`竖向卡面旋转预览与上传 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/admin/bank-card-covers');
    await page.getByRole('button', { name: '新增公共卡面', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '新增公共卡面', exact: true });
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 605; canvas.height = 960;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 605, 480);
      ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 480, 605, 480);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await editor.getByRole('button', { name: '上传卡面', exact: true }).click();
    await (await chooser).setFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    const preview = editor.locator('.crop-image');
    await editor.getByRole('button', { name: '向左旋转90度', exact: true }).click();
    await expect(preview).toHaveAttribute('style', /rotate\(270deg\)/);
    await editor.getByRole('button', { name: '向右旋转90度', exact: true }).click();
    await expect(preview).toHaveAttribute('style', /rotate\(0deg\)/);
    for (let turn = 0; turn < 4; turn++) await editor.getByRole('button', { name: '向右旋转90度', exact: true }).click();
    await expect(preview).toHaveAttribute('style', /rotate\(0deg\)/);
    await editor.getByRole('button', { name: '向右旋转90度', exact: true }).click();
    if (theme === 'dark') {
      await picker(page, '图片适配', '填满');
      await expect(page.locator('.uni-picker-action-confirm:visible, .uni-picker-select .uni-picker-item:visible')).toHaveCount(0);
    }
    const stage = await editor.locator('.crop-preview').boundingBox(), image = await preview.boundingBox();
    expect(Math.abs(stage.width - image.width)).toBeLessThan(1);
    expect(Math.abs(stage.height - image.height)).toBeLessThan(1);
    await page.screenshot({ path: `artifacts/cover-rotation/${width}-${theme}.png`, fullPage: true });
    await editor.getByRole('button', { name: '确认上传', exact: true }).click();
    await expect(editor.getByRole('button', { name: '更换卡面', exact: true })).toBeVisible();
    expect(state.uploads).toHaveLength(1);
    const uploaded = state.uploads[0];
    const start = uploaded.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const end = uploaded.indexOf(Buffer.from('IEND'), start) + 8;
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return { width: img.width, height: img.height, left: [...ctx.getImageData(10, 302, 1, 1).data], right: [...ctx.getImageData(949, 302, 1, 1).data] };
    }, uploaded.subarray(start, end).toString('base64'));
    expect(pixels).toEqual({ width: 960, height: 605, left: [0, 0, 255, 255], right: [255, 0, 0, 255] });
  });
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`已有卡面旋转取消与保存 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    await page.goto('/#/pages/admin/bank-card-covers');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 605; canvas.height = 960;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 605, 480);
      ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 480, 605, 480);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.route('**/api/file/preview/' + fileId, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }));
    await page.getByRole('button', { name: '编辑' + cover.name, exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑公共卡面', exact: true });
    await expect(editor.getByRole('button', { name: '移除卡面', exact: true })).toHaveCount(0);
    await editor.getByRole('button', { name: '旋转已有卡面', exact: true }).click();
    await editor.getByRole('button', { name: '向右旋转90度', exact: true }).click();
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await editor.getByRole('button', { name: '取消调整', exact: true }).click();
    expect(state.uploads).toHaveLength(0);
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: '旋转已有卡面', exact: true }).click();
    await expect(editor.locator('.crop-image')).toHaveAttribute('style', /rotate\(0deg\)/);
    await editor.getByRole('button', { name: '向右旋转90度', exact: true }).click();
    await page.screenshot({ path: `artifacts/cover-rotation/existing-${width}-${theme}.png`, fullPage: true });
    await editor.getByRole('button', { name: '确认上传', exact: true }).click();
    await expect(editor.getByRole('button', { name: '旋转已有卡面', exact: true })).toBeVisible();
    expect(state.uploads).toHaveLength(1);
    const uploaded = state.uploads[0], start = uploaded.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const pixels = await page.evaluate(async data => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return { width: img.width, height: img.height, left: [...ctx.getImageData(10, 302, 1, 1).data], right: [...ctx.getImageData(949, 302, 1, 1).data] };
    }, uploaded.subarray(start, uploaded.indexOf(Buffer.from('IEND'), start) + 8).toString('base64'));
    expect(pixels).toEqual({ width: 960, height: 605, left: [0, 0, 255, 255], right: [255, 0, 0, 255] });
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(state.calls.at(-1).method).toBe('PUT');
    expect(state.calls.at(-1).body.fileId).toBe(uploadedId);
  });
}
