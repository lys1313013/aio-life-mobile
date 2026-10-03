const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const catalog = require('../../src/services/icons/business-icons.json');

const names = ['svg:ab-wheel', 'svg:plank', 'svg:push-up', 'svg:sit-up', 'svg:pull-up', 'svg:chin-up', 'svg:bench-press', 'svg:barbell-curl', 'svg:reverse-crunch', 'mdi:swim'];
const labels = ['健腹轮', '平板支撑', '俯卧撑', '仰卧起坐', '引体向上', '反手引体向上', '卧推', '杠铃弯举', '反向卷腹', '游泳'];

async function loadedImages(locator, count) {
  await expect(locator).toHaveCount(count);
  await expect.poll(() => locator.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`本地运动图标：首页、记录和分类 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    const categories = names.map((icon, i) => ({ id: String(81 + i), dictType: 'exercise_type', dictLabel: labels[i], dictValue: String(i), dictSort: i, icon, color: '#5b8ff9', status: '0' }));
    const externalIcons = [];
    page.on('request', request => { if (/iconify/.test(request.url())) externalIcons.push(request.url()); });
    let saved;
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let data;
      if (path.endsWith('/getByDictType')) data = { dictDetailList: categories };
      else if (path === '/api/userDictType/dictTypeEnum') data = [{ value: 'exercise_type', label: '运动分类' }];
      else if (path === '/api/userDictData/query') data = { items: categories, total: categories.length };
      else if (path === '/api/userDictData' && request.method() === 'PUT') {
        saved = request.postDataJSON();
        Object.assign(categories.find(item => item.id === saved.id), saved);
        data = true;
      } else if (path === '/api/exerciseRecord/dashboardSummary') data = { hasMore: false, days: [{ date: '2026-10-01', items: categories.map(type => ({ exerciseTypeId: type.id, typeLabel: type.dictLabel, icon: type.icon, color: type.color, count: 20, trend: [] })) }] };
      else return route.fallback();
      await route.fulfill({ json: { rscode: '0', data } });
    });
    state.exercise = categories.slice(0, 3).map((type, i) => ({ id: String(101 + i), exerciseTypeId: type.id, exerciseDate: '2026-10-01', exerciseCount: 20 }));
    await page.reload();
    await loadedImages(page.locator('.exercise-main .category-icon-image img'), 10);
    await page.locator('.exercise-main').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('home.png') });

    await page.goto('/#/pages/records/exercise');
    await loadedImages(page.locator('.record-type .category-icon-image img'), 3);
    await expect(page.locator('.record-type .category-icon-dot')).toHaveCount(0);
    await page.locator('.record-header').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('exercise.png') });

    await page.goto('/#/pages/records/categories');
    await loadedImages(page.locator('.card .toolbar > .category-icon .category-icon-image img'), 10);
    await expect(page.locator('.card .category-icon-dot')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('categories.png') });
    await page.getByRole('button', { name: '编辑分类', exact: true }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    // 已保存的 svg 名称可回显、预览、更新，不能退化成圆点。
    await expect(page.locator('[aria-label="图标"] input')).toHaveValue('svg:ab-wheel');
    await loadedImages(dialog.locator('.category-icon-preview .category-icon-image img'), 1);
    await page.locator('[aria-label="图标"] input').fill('svg:push-up');
    await expect.poll(async () => {
      const src = await dialog.locator('.category-icon-preview .category-icon-image img').getAttribute('src');
      return Buffer.from(src.split(',')[1], 'base64').toString().includes(catalog.icons['svg:push-up'].body.replaceAll('currentColor', '#5b8ff9'));
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('editor.png') });
    await page.locator('[aria-label="保存"]').click();
    await expect(dialog).toHaveCount(0);
    expect(saved.icon).toBe('svg:push-up');
    expect(saved.id).toBe('81');
    expect(externalIcons).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
