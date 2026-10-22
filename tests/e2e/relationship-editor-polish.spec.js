const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

const person = {
  id: '9223372036854775801', name: '模拟小林', category: '社会',
  description: '一起学习和跑步的朋友', birthday: '1994-03-12', phone: '13800000000',
  email: 'example@example.com', school: '模拟大学', avatar: 'https://example.com/avatar.png',
  tags: '同学,跑步', socialLinks: 'https://example.com/profile', notes: '每月约一次晨跑',
  relationships: [],
};
async function start(page) {
  await setup(page);
  const state = { requests: [], paths: [], fail: false };
  await page.route('**/api/relationships/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PUT') {
      state.requests.push(route.request().postDataJSON());
      state.paths.push(url.pathname);
      await route.fulfill({ json: state.fail ? { code: 400, message: '模拟保存失败' } : { code: 0, data: person } });
      return;
    }
    const data = url.pathname.endsWith('/graph') ? { nodes: [person], edges: [] } : person;
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/relationship/index');
  await page.getByRole('button', { name: person.name, exact: true }).click();
  await page.getByRole('button', { name: '编辑人物', exact: true }).click();
  return state;
}

test('person editor keeps folded fields in save payload and retains edits after failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await start(page);
  const dialog = page.getByRole('dialog', { name: '人物', exact: true });
  await expect(dialog.getByRole('button', { name: '联系信息', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('button', { name: '更多资料', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: '联系信息', exact: true }).click();
  await dialog.getByRole('textbox', { name: '电话', exact: true }).fill('13900000000');
  await dialog.getByRole('button', { name: '联系信息', exact: true }).click();
  await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
  await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('更新后的晨跑安排');
  await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
  state.fail = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('模拟保存失败');
  const { id, relationships, ...editableFields } = person;
  expect(state.paths[0]).toBe(`/api/relationships/persons/${id}`);
  expect(state.requests[0]).toEqual({ ...editableFields, phone: '13900000000', notes: '更新后的晨跑安排' });
  await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('更新后的晨跑安排');
  await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
  state.fail = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests[1]).toEqual(state.requests[0]);
  expect(state.paths).toEqual([`/api/relationships/persons/${id}`, `/api/relationships/persons/${id}`]);
});

test('person editor resets sections on reopening and keeps required name visible', async ({ page }) => {
  await start(page);
  const dialog = page.getByRole('dialog', { name: '人物', exact: true });
  await dialog.getByRole('button', { name: '联系信息', exact: true }).click();
  await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '编辑人物', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '联系信息', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('button', { name: '更多资料', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await dialog.getByRole('textbox', { name: '姓名', exact: true }).fill('');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('请输入姓名');
  await expect(dialog.getByRole('textbox', { name: '姓名', exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`person editor visual ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await start(page);
    const dialog = page.getByRole('dialog', { name: '人物', exact: true });
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    const screenshot = state => page.screenshot({ path: `artifacts/ui-polish-20261022/relationship-${width}-${theme}-${state}.png` });
    await screenshot('collapsed');
    await dialog.getByRole('button', { name: '联系信息', exact: true }).click();
    await dialog.getByRole('button', { name: '更多资料', exact: true }).click();
    await dialog.getByRole('textbox', { name: '姓名', exact: true }).scrollIntoViewIfNeeded();
    await screenshot('expanded');
    await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
    await screenshot('bottom');
    const cancel = await dialog.getByRole('button', { name: '取消', exact: true }).boundingBox();
    const save = await dialog.getByRole('button', { name: '保存', exact: true }).boundingBox();
    expect(cancel.x + cancel.width).toBeLessThanOrEqual(save.x);
    expect(Math.abs(cancel.y - save.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
