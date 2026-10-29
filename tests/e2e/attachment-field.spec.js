const { test, expect } = require('./support/test');
const { setup, id } = require('./qa-records-fixtures');
const fs = require('node:fs');
const path = require('node:path');
const image = fs.readFileSync(path.join(__dirname, '../../src/static/book.png'));
const fileId = '9223372036854775806';
const uploadedId = '9223372036854775805';

async function device(page) {
  const state = await setup(page);
  state.devices[0].fileId = fileId;
  state.devices[0].remark = '模拟较长的设备备注，用于检查编辑弹窗内部滚动及底部操作栏。';
  await page.route('**/api/file/preview/*', route => {
    expect(route.request().headers().authorization).toBe('Bearer records-fixture');
    return route.fulfill({ contentType: 'image/png', body: image });
  });
  await page.goto('/#/pages/goods/devices');
  await expect(page.locator('.device-page-active .goods-photo img')).toHaveJSProperty('naturalWidth', 72);
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`单图附件缩略图和 loading 高度 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await device(page);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/file/preview/' + fileId, async route => {
      await pending;
      await route.fulfill({ contentType: 'image/png', body: image });
    });
    await page.getByRole('button', { name: '编辑设备', exact: true }).click();
    const editor = page.locator('[role=dialog][aria-label="编辑设备"]');
    await expect(editor.getByRole('button', { name: '关闭', exact: true })).toHaveCount(0);
    await expect(editor.locator('.device-editor-header')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: '添加文件', exact: true })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: '添加图片', exact: true })).toHaveCount(0);
    const tile = editor.locator('.attachment-tile');
    await expect(tile.getByRole('status')).toBeVisible();
    await editor.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const before = await tile.boundingBox();
    const actionsBefore = await editor.locator('.form-actions').boundingBox();
    release();
    await expect(tile.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 72);
    await expect(tile.getByRole('status')).toHaveCount(0);
    const after = await tile.boundingBox();
    const actionsAfter = await editor.locator('.form-actions').boundingBox();
    expect(after.height).toBe(before.height);
    expect(Math.abs(actionsAfter.y - actionsBefore.y)).toBeLessThan(2);
    await editor.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`device-${width}-${theme}.png`) });
    await editor.getByRole('button', { name: '移除附件', exact: true }).click();
    await expect(tile).toHaveCount(0);
    await expect(editor.getByRole('button', { name: '添加图片', exact: true })).toBeVisible();
    await expect(editor.locator('.attachment-field [role=button]')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`add-image-${width}-${theme}.png`) });
  });
}

test('缩略图下载和图片解码失败可原位重试，替换图片后按字符串 ID 保存', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const state = await device(page);
  let requests = 0;
  await page.route('**/api/file/preview/' + fileId, route => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 500, body: 'fixture error' });
    if (requests === 2) return route.fulfill({ contentType: 'image/png', body: 'invalid image' });
    return route.fulfill({ contentType: 'image/png', body: image });
  });
  await page.getByRole('button', { name: '编辑设备', exact: true }).click();
  const editor = page.locator('[role=dialog][aria-label="编辑设备"]');
  const retry = editor.getByRole('button', { name: '重试图片', exact: true });
  await expect(retry).toBeVisible();
  await editor.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  const failed = await editor.locator('.attachment-tile').boundingBox();
  await retry.click();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(editor.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 72);
  expect((await editor.locator('.attachment-tile').boundingBox()).height).toBe(failed.height);
  await editor.getByRole('button', { name: '预览附件', exact: true }).click();
  await expect(page.locator('uni-page[data-page="uni:previewImage"]')).toBeVisible();
  expect(await page.locator('uni-page[data-page="uni:previewImage"]').evaluate(node => Number(getComputedStyle(node).zIndex))).toBeGreaterThan(1100);
  await page.locator('uni-page[data-page="uni:previewImage"]').click();
  await expect(page.locator('uni-page[data-page="uni:previewImage"]')).toHaveCount(0);
  await editor.getByRole('button', { name: '移除附件', exact: true }).click();
  await page.route('**/api/file/upload', route => route.fulfill({ json: { code: 0, data: {
    id: uploadedId, fileName: '模拟图片.png', fileType: 'image/png',
  } } }));
  const chooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '添加图片', exact: true }).click();
  await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
  await expect(editor.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 72);
  await expect(editor.getByRole('button', { name: '添加图片', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(state.writes.find(write => write.path === '/api/device/' + id).body.fileId).toBe(uploadedId);
});

test('公共附件组件识别 MIME 与扩展名，多图片和文档在只读详情中正确展示', async ({ page }, info) => {
  await setup(page);
  await page.route('**/api/feedback/my/' + id, route => route.fulfill({ json: { code: 0, data: {
    id, title: '模拟反馈', content: '模拟反馈正文', status: 'PENDING', comments: [], files: [
      { id: fileId, fileName: '没有扩展名的图片', fileType: 'image/png' },
      { id: 'extension-image', fileName: '模拟照片.JPG' },
      { id: 'document', fileName: '模拟很长的附件名称用于验证文档文件名换行布局和预览入口.pdf', fileType: 'application/pdf' },
    ],
  } } }));
  await page.route('**/api/file/preview/*', route => route.fulfill({ contentType: 'image/png', body: image }));
  await page.goto('/#/pages/records/feedback');
  await page.getByRole('button', { name: '反馈详情', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '反馈详情', exact: true });
  const attachments = detail.locator('.attachment-field').first();
  await expect(attachments.locator('.attachment-tile')).toHaveCount(2);
  await expect(attachments.locator('.attachment-image img').first()).toHaveJSProperty('naturalWidth', 72);
  await expect(attachments.locator('.attachment-document')).toHaveCount(1);
  await expect(attachments.getByRole('button', { name: '移除附件', exact: true })).toHaveCount(0);
  await expect(attachments.getByRole('button', { name: '添加图片', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '添加文件', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('shared-attachments.png') });
});


test('取消选择不报错，图片上传失败只在添加入口内重试，上传期间禁止重复操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await setup(page);
  await page.goto('/#/pages/goods/devices');
  await page.getByRole('button', { name: '新增设备', exact: true }).click();
  const editor = page.locator('[role=dialog][aria-label="编辑设备"]');
  const attachments = editor.locator('.attachment-field');
  const add = attachments.getByRole('button', { name: '添加图片', exact: true });
  const chooserPromise = page.waitForEvent('filechooser');
  await add.click();
  const chooser = await chooserPromise;
  await chooser.element().dispatchEvent('cancel');
  await expect(add).toBeEnabled();
  await expect(attachments.getByRole('alert')).toHaveCount(0);
  await expect(attachments.locator('[role=button]')).toHaveCount(1);
  let uploads = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/file/upload', async route => {
    uploads++;
    if (uploads === 1) return route.fulfill({ status: 500, body: 'fixture failure' });
    await pending;
    return route.fulfill({ json: { code: 0, data: { id: uploadedId, fileName: '模拟图片.png', fileType: 'image/png' } } });
  });
  await page.route('**/api/file/preview/*', route => route.fulfill({ contentType: 'image/png', body: image }));
  async function selectImage() {
    const selected = page.waitForEvent('filechooser');
    await add.click();
    await (await selected).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
  }
  const before = await attachments.boundingBox();
  await selectImage();
  await expect(add.getByRole('alert')).toHaveText('上传失败，点击重试');
  await expect(attachments.locator('[role=button]')).toHaveCount(1);
  await selectImage();
  await expect(add).toBeDisabled();
  await expect(add.getByRole('status')).toBeVisible();
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  release();
  await expect(attachments.locator('.attachment-image img')).toHaveJSProperty('naturalWidth', 72);
  await expect(add).toHaveCount(0);
  expect((await attachments.boundingBox()).height).toBe(before.height);
  expect(uploads).toBe(2);
});
