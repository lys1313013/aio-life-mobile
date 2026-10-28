const { test, expect } = require('./support/test');
const { setup, id } = require('./qa-records-fixtures.js');

for (const width of [390, 480, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`按钮按下、禁用与保存加载保持背景及尺寸 ${width} ${theme}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // 应用浅色也在系统暗色下检查，避免框架媒体查询覆盖应用主题。
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), theme);
    const state = await setup(page, baseURL);
    await page.goto('/#/pages/records/notes?kind=think');
    await page.getByRole('button', { name: '编辑闪念', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑闪念', exact: true });
    const add = dialog.getByRole('button', { name: '新增关联事件' });
    const addBox = await add.boundingBox();
    await page.mouse.move(addBox.x + addBox.width / 2, addBox.y + addBox.height / 2);
    await page.mouse.down();
    await expect(add).toHaveClass(/mobile-button-pressed/);
    await expect(add).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.up();
    await expect(dialog.getByRole('textbox', { name: '关联事件 2' })).toBeVisible();
    await dialog.getByRole('textbox', { name: '内容', exact: true }).fill('模拟按钮状态回归');

    // 避免 uni-app 的原生 input 包装影响 Playwright 主世界的隐式角色解析。
    const buttons = page.locator('[role="dialog"][aria-label="编辑闪念"] .mobile-button');
    const snapshot = () => buttons.evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { background: getComputedStyle(el).backgroundColor, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    const before = await snapshot();
    let releaseSave, releaseRead;
    const savePending = new Promise(resolve => { releaseSave = resolve; });
    const readPending = new Promise(resolve => { releaseRead = resolve; });
    let rereading = false;
    await page.route(`**/api/thought/${id}`, async route => {
      await savePending;
      Object.assign(state.thoughts[0], route.request().postDataJSON());
      await route.fulfill({ json: { code: 0, data: true } });
    });
    await page.route('**/api/thought/query*', async route => {
      rereading = true;
      await readPending;
      await route.fulfill({ json: { code: 1, message: '模拟读取失败' } });
    });
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(dialog.locator('.mobile-button-loading')).toBeVisible();
    expect(await snapshot()).toEqual(before);
    for (const name of ['删除闪念', '新增关联事件', '隐藏内容', '展示到看板', '取消']) {
      await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await page.screenshot({ path: info.outputPath('saving.png') });
    releaseSave();
    await expect.poll(() => rereading).toBe(true);
    await expect(save).toBeVisible();
    expect(await snapshot()).toEqual(before);
    releaseRead();
    await expect(dialog.getByRole('alert')).toHaveText('模拟读取失败');
    const retry = dialog.getByRole('button', { name: '重新读取', exact: true });
    await expect(retry).toBeEnabled();
    const bounds = await dialog.boundingBox();
    for (const button of await buttons.all()) {
      const rect = await button.boundingBox();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await expect(add).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: info.outputPath('retry.png') });
  });
}
