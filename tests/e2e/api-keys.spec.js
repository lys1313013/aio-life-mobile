const { test, expect } = require('./support/test');
const ok = data => ({ json: { code: 0, message: null, data } });
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`API Key 编辑备注、创建复制与删除 ${width} ${theme}`, async ({ page, apiMock, context }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(value => {
      localStorage.setItem('aio-life-mobile.access-token.v1', 'fixture-api-keys');
      localStorage.setItem('aio-life-mobile.theme.v1', value);
    }, theme);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const id = '9007199254740993';
    const secret = 'ak-synthetic-new-key-123456789';
    let rows = [{ id, remark: '模拟 MCP 客户端', apiKey: 'ak-synth***6789', expiredAt: null, createTime: '2026-11-10 10:00:00', isExpired: false }];
    let reads = 0, writes = 0, fail = true;
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: [] }),
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
      'GET /api/api-key/list': () => { reads++; return ok(rows); },
      [`PUT /api/api-key/${id}`]: request => {
        writes++;
        expect(request.postDataJSON()).toEqual({ remark: '修改后的备注' });
        if (fail) return { json: { code: 1, message: '模拟保存失败' } };
        rows[0].remark = request.postDataJSON().remark;
        return ok(rows[0]);
      },
      'POST /api/api-key/generate': request => {
        expect(request.postDataJSON()).toEqual({ remark: '模拟新密钥', expireDays: 0 });
        rows.unshift({ ...rows[0], id: '9007199254740995', remark: '模拟新密钥' });
        return ok({ apiKey: secret });
      },
      [`DELETE /api/api-key/${id}`]: () => { rows = rows.filter(row => row.id !== id); return ok(null); },
    });
    await page.goto('/#/pages/mcp/api-keys');
    await expect(page.getByText('模拟 MCP 客户端', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('list.png'), fullPage: true });
    await page.getByRole('button', { name: '修改备注', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '修改备注', exact: true });
    await expect(dialog.getByText('有效期', { exact: true })).toHaveCount(0);
    const input = dialog.locator('[aria-label="备注"] input');
    await input.fill('   ');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect(writes).toBe(0);
    await input.fill('修改后的备注');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('模拟保存失败');
    await expect(input).toHaveValue('修改后的备注');
    await page.screenshot({ path: info.outputPath('edit-retry.png'), fullPage: true });
    const beforeSave = reads;
    fail = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('修改后的备注', { exact: true })).toBeVisible();
    expect(reads).toBe(beforeSave);
    await page.getByRole('button', { name: '创建 API Key', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '创建 API Key', exact: true });
    await dialog.locator('[aria-label="备注"] input').fill('模拟新密钥');
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'API Key 已创建', exact: true });
    await expect(dialog.getByText(secret, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '复制 API Key', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(secret);
    await page.screenshot({ path: info.outputPath('created.png'), fullPage: true });
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    const beforeDelete = reads;
    const row = page.locator('.key-row').filter({ hasText: '修改后的备注' });
    await row.getByRole('button', { name: '删除 API Key', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(reads).toBe(beforeDelete);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
