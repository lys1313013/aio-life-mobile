const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-platform-fixtures');
const path = require('node:path');
const iconNames = Object.keys(require('../../src/services/icons/catalog.generated.json').icons);
const iconCount = iconNames.length;
const id = '9223372036854775807';
const original = {
  id, parentId: '0', userId: '9223372036854775806', name: '阅读与长篇写作',
  color: '#13579B', icon: 'custom:reading-symbol', description: '保留原有的分类说明。',
  isTrackTime: 1, isEnabled: 1, timeType: 2, sort: 20,
};
async function start(page) {
  await setup(page);
  const state = { fail: false, writes: [] };
  await page.route('**/api/timeTrackerCategory**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      state.writes.push(request.postDataJSON());
      return route.fulfill({ json: state.fail ? { code: 1, message: '模拟保存失败' } : { code: 0, data: null } });
    }
    const data = pathname.endsWith('/hidden') ? [] : [{ ...original }];
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/categories/index');
  await page.getByRole('button', { name: '编辑分类', exact: true }).click();
  return state;
}
const editor = page => page.getByRole('dialog', { name: '编辑分类', exact: true });
async function screenshot(page, label) {
  await page.screenshot({ path: path.resolve(`artifacts/ui-polish-20261022/categories-${label}.png`), fullPage: true });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`category editor polish ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await start(page);
    const dialog = editor(page);
    await expect(dialog.locator('.category-preview-name')).toHaveText(original.name);
    await expect(dialog.getByRole('button', { name: '分类描述', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.locator('textarea')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '上移分类', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    await screenshot(page, `${width}-${theme}-compact`);
    await dialog.getByRole('button', { name: '分类描述', exact: true }).click();
    await dialog.getByRole('button', { name: '自定义颜色', exact: true }).click();
    await dialog.getByRole('button', { name: '自定义图标', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '自定义颜色值', exact: true })).toHaveValue(original.color);
    await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveValue(original.icon);
    await expect(dialog.getByRole('textbox', { name: '描述', exact: true })).toHaveValue(original.description);
    await screenshot(page, `${width}-${theme}-expanded`);
    await dialog.getByRole('button', { name: '选择分类图标', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择分类图标', exact: true });
    await expect(picker.locator('.category-icon-option')).toHaveCount(iconCount);
    await screenshot(page, `${width}-${theme}-icons`);
    await picker.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveValue(original.icon);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('category editor preserves values, supports visual/custom choices, resets panels and retries saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await start(page);
  const dialog = editor(page);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0]).toEqual({ id, parentId: '0', name: original.name, color: original.color, icon: original.icon, description: original.description, isTrackTime: 1, isEnabled: 1, timeType: 2, sort: 20 });
  await page.getByRole('button', { name: '编辑分类', exact: true }).click();
  await dialog.getByRole('button', { name: '选择分类图标', exact: true }).click();
  const fullPicker = page.getByRole('dialog', { name: '选择分类图标', exact: true });
  const lastIcon = fullPicker.getByRole('button', { name: '选择图标 ' + iconNames.at(-1), exact: true });
  await lastIcon.scrollIntoViewIfNeeded();
  await expect(lastIcon).toBeInViewport();
  expect(await page.locator('[role="dialog"][aria-label="选择分类图标"]').evaluate(panel => Math.max(...Array.from(panel.querySelectorAll('.uni-scroll-view'), el => el.scrollTop)))).toBeGreaterThan(0);
  await lastIcon.click();
  await expect(fullPicker).toHaveCount(0);
  await dialog.getByRole('button', { name: '自定义图标', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveValue(iconNames.at(-1));
  await dialog.getByRole('button', { name: '自定义图标', exact: true }).click();
  await dialog.getByRole('button', { name: '选择颜色 #722ed1', exact: true }).click();
  await dialog.getByRole('button', { name: '自定义颜色', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '自定义颜色值', exact: true })).toHaveValue('#722ed1');
  await dialog.getByRole('textbox', { name: '自定义颜色值', exact: true }).fill('#ABCDEF');
  await dialog.getByRole('button', { name: '选择分类图标', exact: true }).click();
  let picker = page.getByRole('dialog', { name: '选择分类图标', exact: true });
  await picker.getByRole('textbox', { name: '搜索图标', exact: true }).fill('lucide:book-open');
  await picker.getByRole('button', { name: '选择图标 lucide:book-open', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await dialog.getByRole('button', { name: '自定义图标', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveValue('lucide:book-open');
  await dialog.getByRole('textbox', { name: '图标名称', exact: true }).fill('custom:updated');
  await dialog.getByRole('button', { name: '分类描述', exact: true }).click();
  await dialog.getByRole('textbox', { name: '描述', exact: true }).fill('更新后仍应保留的说明');
  state.fail = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('模拟保存失败');
  await expect(dialog.getByRole('textbox', { name: '自定义颜色值', exact: true })).toHaveValue('#ABCDEF');
  await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveValue('custom:updated');
  await expect(dialog.getByRole('textbox', { name: '描述', exact: true })).toHaveValue('更新后仍应保留的说明');
  state.fail = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1)).toMatchObject({ id, color: '#ABCDEF', icon: 'custom:updated', description: '更新后仍应保留的说明', timeType: 2, isTrackTime: 1, isEnabled: 1, sort: 20 });
  await page.getByRole('button', { name: '编辑分类', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '图标名称', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: '自定义颜色值', exact: true })).toHaveCount(0);
  await expect(dialog.locator('textarea')).toHaveCount(0);
  await dialog.getByRole('button', { name: '选择分类图标', exact: true }).click();
  picker = page.getByRole('dialog', { name: '选择分类图标', exact: true });
  await expect(picker.getByRole('textbox', { name: '搜索图标', exact: true })).toHaveValue('');
  await expect(picker.locator('.category-icon-option')).toHaveCount(iconCount);
});
