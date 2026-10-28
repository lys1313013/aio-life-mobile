const { test, expect } = require('./support/test');
const { setup } = require('./qa-platform-fixtures');
const path = require('node:path');
const fs = require('node:fs');

const categoryRows = [
  { id: '9223372036854775701', parentId: '0', userId: '9223372036854775807', name: '模拟必须分类', color: '#3b82f6', icon: 'lucide:book-open', timeType: 1, isTrackTime: 0, isEnabled: 1, sort: 10 },
  { id: '9223372036854775702', parentId: '0', userId: '9223372036854775807', name: '模拟积极分类与较长的名称', color: '#10b981', icon: 'lucide:book-open', timeType: 2, isTrackTime: 1, isEnabled: 1, sort: 20 },
  { id: '9223372036854775703', parentId: '9223372036854775701', userId: '9223372036854775807', name: '模拟休闲子分类', color: '#f59e0b', icon: 'lucide:book-open', timeType: 3, isTrackTime: 0, isEnabled: 1, sort: 30 },
];
async function openCategories(page, admin = false) {
  await setup(page);
  await page.route('**/api/timeTrackerCategory**', route => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill({ json: { code: 0, data: pathname.endsWith('/hidden') ? [] : categoryRows } });
  });
  await page.goto('/#/pages/categories/index' + (admin ? '?admin=1' : ''));
  await expect(page.locator('.category-card')).toHaveCount(3);
}

for (const admin of [false, true]) {
  test(`category search and secondary actions preserve access ${admin ? 'admin' : 'personal'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCategories(page, admin);
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增子分类', exact: true })).toHaveCount(0);
    const firstCard = page.locator('.category-card').filter({ hasText: '模拟必须分类' });
    await firstCard.getByRole('button', { name: '更多分类操作', exact: true }).click();
    await expect(firstCard.getByRole('button', { name: '新增子分类', exact: true })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: '隐藏分类', exact: true })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: '删除分类', exact: true })).toBeVisible();
    await firstCard.getByRole('button', { name: '收起子分类', exact: true }).click();
    await expect(page.locator('.category-card')).toHaveCount(2);
    await page.getByRole('textbox', { name: '搜索分类', exact: true }).fill('模拟休闲子分类');
    await expect(page.locator('.category-card')).toHaveCount(1);
    await page.getByRole('textbox', { name: '搜索分类', exact: true }).fill('没有这个分类的模拟搜索');
    await expect(page.getByText('未找到匹配分类', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '搜索分类', exact: true })).toHaveValue('');
    await expect(page.locator('.category-card')).toHaveCount(2);
    await firstCard.getByRole('button', { name: '编辑分类', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑分类', exact: true }).getByRole('switch', { name: '卡片统计', exact: true })).toBeVisible();
  });
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`category compact rows ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await openCategories(page);
    const rows = page.locator('.category-card');
    const colors = await page.locator('.category-type').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
    expect(new Set(colors).size).toBe(3);
    expect(await rows.evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    const editBox = await rows.first().getByRole('button', { name: '编辑分类', exact: true }).boundingBox();
    expect(editBox.width).toBeGreaterThanOrEqual(44);
    expect(editBox.height).toBeGreaterThanOrEqual(44);
    const output = path.resolve('artifacts/ui-fixes-2026-10-25/categories');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `list-${width}-${theme}.png`), fullPage: true });
    await rows.first().getByRole('button', { name: '编辑分类', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑分类', exact: true });
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, `editor-${width}-${theme}.png`), fullPage: true });
  });
}
