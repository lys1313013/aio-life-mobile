const { test, expect } = require('./support/test');
const path = require('node:path');
const fs = require('node:fs');
const { pullDown } = require('./gestures');
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }

const categoryRows = [
  { id: '9223372036854775701', parentId: '0', userId: '9223372036854775807', name: '模拟一级分类', color: '#3b82f6', icon: 'lucide:book-open', isTrackTime: 0, isEnabled: 1, sortOrder: 10 },
  { id: '9223372036854775702', parentId: '0', userId: '9223372036854775807', name: '模拟分类与较长的名称，用于检查多行换行及右侧操作按钮对齐', color: '#10b981', icon: 'lucide:book-open', isTrackTime: 1, isEnabled: 1, sortOrder: 20 },
  { id: '9223372036854775703', parentId: '9223372036854775701', userId: '9223372036854775807', name: '模拟子分类', color: '#f59e0b', icon: 'lucide:book-open', isTrackTime: 0, isEnabled: 1, sortOrder: 30 },
];
async function openCategories(page, apiMock, admin = false, { handlers = {}, waitForRows = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'category-fixture'));
  const ok = data => ({ json: { code: 0, message: null, data } });
  apiMock({
    'GET /api/user/info': ok({ id: '9223372036854775807', nickname: '分类模拟用户', roles: ['admin'] }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/timeTrackerCategory/list': ok(categoryRows),
    'GET /api/timeTrackerCategory/hidden': ok([]),
    'GET /api/timeTrackerCategory/admin/list': ok(categoryRows),
    ...handlers,
  });
  await page.goto('/#/pages/categories/index' + (admin ? '?admin=1' : ''));
  await expect(page.locator('html')).not.toHaveClass(/aio-page-motion/);
  if (waitForRows) await expect(page.locator('.category-card')).toHaveCount(3);
}

for (const admin of [false, true]) {
  test(`category search and secondary actions preserve access ${admin ? 'admin' : 'personal'}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCategories(page, apiMock, admin);
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增子分类', exact: true })).toHaveCount(0);
    const firstCard = page.locator('.category-card').filter({ hasText: '模拟一级分类' });
    await firstCard.getByRole('button', { name: '更多分类操作', exact: true }).click();
    await expect(firstCard.getByRole('button', { name: '新增子分类', exact: true })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: '隐藏分类', exact: true })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: '删除分类', exact: true })).toBeVisible();
    await firstCard.getByRole('button', { name: '收起子分类', exact: true }).click();
    await expect(page.locator('.category-card')).toHaveCount(2);
    await page.getByRole('textbox', { name: '搜索分类', exact: true }).fill('模拟子分类');
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
  test(`category compact rows ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await openCategories(page, apiMock);
    const rows = page.locator('.category-card');
    await expect(page.locator('.category-type')).toHaveCount(0);
    expect(await rows.first().getByRole('button', { name: '编辑分类', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
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
    await expect(dialog.getByText('时间类型', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(output, `editor-${width}-${theme}.png`), fullPage: true });
  });

  test(`category loading and refresh retain compact rows ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const state = { pending: gate(), fail: false, rows: categoryRows };
    const response = async () => {
      await state.pending.promise;
      return { json: state.fail ? { code: 1, message: '模拟分类加载失败' } : { code: 0, message: null, data: state.rows } };
    };
    try {
      await openCategories(page, apiMock, false, {
        waitForRows: false, handlers: { 'GET /api/timeTrackerCategory/list': response },
      });
      const pageState = page.locator('.page-state').first();
      await expect(page.getByRole('status', { name: '正在加载分类', exact: true })).toBeVisible();
      const skeletonHeight = (await page.locator('.category-card-skeleton').first().boundingBox()).height;
      await page.screenshot({ path: info.outputPath('loading.png') });
      state.pending.release();
      const rows = page.locator('.category-card');
      await expect(rows).toHaveCount(3);
      const height = (await rows.first().boundingBox()).height;
      expect(Math.abs(height - skeletonHeight)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('content.png') });

      state.pending = gate(); state.fail = true;
      await pullDown(page, '.mobile-page-scroll');
      await expect(pageState).toHaveAttribute('aria-busy', 'true');
      await expect(rows).toHaveCount(3);
      await expect(page.locator('.category-card-skeleton')).toHaveCount(0);
      expect((await rows.first().boundingBox()).height).toBe(height);
      await page.screenshot({ path: info.outputPath('refreshing.png') });
      state.pending.release();
      await expect(page.getByRole('alert', { name: '更新失败：模拟分类加载失败', exact: true })).toBeVisible();
      await expect(rows).toHaveCount(3);
      await page.screenshot({ path: info.outputPath('refresh-failed.png') });

      state.fail = false; state.pending = gate();
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await expect(pageState).toHaveAttribute('aria-busy', 'true');
      await expect(rows).toHaveCount(3);
      state.pending.release();
      await expect(pageState).toHaveAttribute('aria-busy', 'false');
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect((await rows.first().boundingBox()).height).toBe(height);

      state.rows = [];
      await pullDown(page, '.mobile-page-scroll');
      await expect(page.getByText('暂无分类', { exact: true })).toBeVisible();
      await expect(rows).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('empty.png') });

      state.rows = [categoryRows[1]];
      await pullDown(page, '.mobile-page-scroll');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(categoryRows[1].name);
      expect(await rows.first().evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath('single-long-name.png') });
    } finally { state.pending.release(); }
  });
}
