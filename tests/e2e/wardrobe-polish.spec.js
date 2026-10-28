const { test, expect } = require('./support/test');
const fs = require('node:fs');
const { setup } = require('./qa-records-fixtures');
const { pullDown } = require('./gestures');
const out = 'artifacts/ui-polish-20261022';
const firstId = '9223372036854775807';
const clothes = Array.from({ length: 6 }, (_, index) => ({
  id: index ? String(9100 + index) : firstId,
  name: index === 0 ? '米白色棉麻通勤衬衫' : index === 1 ? '深蓝色轻量防风外套，适合春秋出行与日常通勤' : ['日常圆领短袖', '宽松针织开衫', '秋冬羊毛围巾', '基础直筒牛仔裤'][index - 2],
  categoryId: index === 4 ? '82' : '81', categoryName: index === 4 ? '配饰' : '上衣',
  color: index % 2 ? '深蓝' : '米白', brand: '模拟品牌', size: 'M',
  season: index === 2 ? '夏' : index === 4 ? '冬' : '春,秋', price: 100 + index * 20,
  fileId: index % 2 ? null : '9223372036854775806', purchaseDate: '2026-10-01',
  remark: '适合日常通勤，可与深色长裤搭配。轻柔清洗，避免高温烘干。',
}));
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
async function fixture(page) {
  await setup(page);
  const state = { rows: structuredClone(clothes), hold: null, readFail: false, saveFail: false, writes: [] };
  await page.route('**/api/wardrobe/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') {
      const body = req.postDataJSON(); state.writes.push({ method: req.method(), path, body });
      if (state.saveFail) return route.fulfill({ json: { code: 1, message: '模拟保存失败' } });
      if (req.method() === 'PUT') Object.assign(state.rows.find(row => path.endsWith('/' + row.id)) || {}, body);
      return route.fulfill({ json: { code: 0, data: true } });
    }
    if (path === '/api/wardrobe/items' && state.hold) await state.hold.promise;
    if (state.readFail) return route.fulfill({ json: { code: 1, message: '模拟衣柜加载失败' } });
    let data;
    if (path === '/api/wardrobe/items') data = state.rows;
    else if (path === '/api/wardrobe/categories') data = [
      { id: '81', name: '上衣', parentId: '0', categoryType: 0 },
      { id: '82', name: '配饰', parentId: '0', categoryType: 1 },
    ];
    else if (path === '/api/wardrobe/stats') {
      const totalValue = state.rows.reduce((sum, row) => sum + row.price, 0);
      data = { totalCount: state.rows.length, totalValue, avgPrice: state.rows.length ? totalValue / state.rows.length : 0,
        seasonCount: Object.fromEntries(['春', '夏', '秋', '冬'].map(season => [season, state.rows.filter(row => row.season.includes(season)).length])) };
    } else data = state.rows.find(row => path.endsWith('/' + row.id));
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.route('**/api/file/preview/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#eae7df"/><path d="M106 62 63 90 31 147 76 170 94 134 92 247 208 247 206 134 224 170 269 147 237 90 194 62 172 77 128 77Z" fill="#faf8f2" stroke="#c2bcae" stroke-width="3"/><path d="M128 77 150 104 172 77M150 104V247" fill="none" stroke="#c2bcae" stroke-width="2"/><circle cx="156" cy="136" r="2" fill="#a89b88"/><circle cx="156" cy="168" r="2" fill="#a89b88"/></svg>' }));
  return state;
}
async function shot(page, name) {
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: `${out}/wardrobe-${name}.png`, fullPage: true });
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`衣柜优化 布局与编辑 ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const state = await fixture(page);
    await page.goto('/#/pages/goods/wardrobe');
    await expect(page.locator('.item-title')).toHaveCount(6);
    await expect(page.locator('.summary-cell')).toHaveCount(3);
    const metrics = await page.locator('.summary-cell').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(Math.max(...metrics.map(box => box.y)) - Math.min(...metrics.map(box => box.y))).toBeLessThan(1);
    expect((await page.locator('.item-card').first().boundingBox()).y).toBeLessThan(360);
    await shot(page, `${width}-${theme}-page`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '筛选夏季衣物', exact: true }).click();
    await expect(page.locator('.item-title')).toHaveCount(1);
    await expect(page.locator('.item-title')).toHaveText('日常圆领短袖');
    await page.locator('[aria-label="搜索衣物"] input').fill('不匹配');
    await expect(page.getByText('没有符合筛选条件的衣物')).toBeVisible();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await expect(page.locator('.item-title')).toHaveCount(6);
    await page.getByRole('button', { name: '编辑衣物' + clothes[0].name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '衣物编辑', exact: true });
    await expect(dialog.locator('.edit-photo.goods-media')).toBeVisible();
    await shot(page, `${width}-${theme}-edit`);
    await dialog.locator('[aria-label="名称"] input').fill('优化后衬衫');
    state.saveFail = true;
    await dialog.getByRole('button', { name: '保存衣柜内容', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('模拟保存失败');
    await expect(dialog.locator('[aria-label="名称"] input')).toHaveValue('优化后衬衫');
    state.saveFail = false;
    await dialog.getByRole('button', { name: '保存衣柜内容', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes.at(-1)).toMatchObject({ method: 'PUT', path: '/api/wardrobe/items/' + firstId,
      body: { name: '优化后衬衫', categoryId: '81', season: ['春', '秋'], fileId: '9223372036854775806', remark: clothes[0].remark } });
    await page.getByRole('button', { name: '新增衣物', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '上传衣物照片', exact: true })).toBeVisible();
    await shot(page, `${width}-${theme}-add`);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '分类', exact: true }).click();
    await page.getByRole('button', { name: '编辑分类配饰', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '衣柜分类编辑' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    expect(errors).toEqual([]);
  });
  test(`衣柜优化 首载空单多与刷新 ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const state = await fixture(page);
    for (const count of [0, 1, 6]) {
      state.rows = structuredClone(clothes.slice(0, count)); state.hold = gate();
      await page.goto('/#/pages/goods/wardrobe'); await page.reload();
      await expect(page.locator('.item-photo .goods-image-skeleton').first()).toBeVisible();
      const initial = await page.locator('.item-grid').first().boundingBox();
      await shot(page, `${width}-${theme}-${count}-loading`);
      state.hold.release(); state.hold = null;
      await expect(page.locator('.summary-loading')).toHaveCount(0);
      await expect(page.locator('.item-title')).toHaveCount(count);
      if (!count) await expect(page.locator('.wardrobe-empty')).toBeVisible();
      else expect(Math.abs((await page.locator('.item-grid').first().boundingBox()).y - initial.y)).toBeLessThan(1);
      await shot(page, `${width}-${theme}-${count}-loaded`);
      const selector = count ? '.item-grid' : '.wardrobe-empty';
      // Native refresher animates its height for 300ms. Read both rectangles in
      // one browser task so the shared vertical movement cancels exactly.
      const geometry = () => page.evaluate(selector => {
        const content = document.querySelector(selector).getBoundingClientRect();
        const summary = document.querySelector('.summary').getBoundingClientRect();
        return { height: content.height, relativeTop: content.y - summary.y };
      }, selector);
      const before = await geometry();
      state.hold = gate();
      await pullDown(page, '.mobile-page-scroll');
      await expect(page.getByRole('status', { name: '正在更新内容' })).toBeVisible();
      await expect(page.locator('.summary-loading')).toHaveCount(0);
      await expect(page.locator('.content-skeleton')).toHaveCount(0);
      const during = await geometry();
      expect(Math.abs(during.height - before.height)).toBeLessThan(1);
      expect(Math.abs(during.relativeTop - before.relativeTop)).toBeLessThan(1);
      state.hold.release(); state.hold = null;
      await expect(page.getByRole('status', { name: '正在更新内容' })).toHaveCount(0);
    }
    state.readFail = true;
    await pullDown(page, '.mobile-page-scroll');
    await expect(page.getByRole('alert')).toContainText('模拟衣柜加载失败');
    await expect(page.locator('.item-title')).toHaveCount(6);
    state.readFail = false;
    await page.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.item-title')).toHaveCount(6);
  });
}
