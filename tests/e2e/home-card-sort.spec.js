const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');

async function setup(page, extra = {}) {
  let cards = homeCardFixture(), fail = false, settled = 0;
  const writes = [], calls = [], errors = [];
  const fixtures = {
    '/user/info': { id: 'fixture-home-sort', nickname: '测试用户' },
    '/auth/secondary-lock/menus': [], '/menu/all': [],
    '/menu/visuals': { menus: [], cards: {} },
    '/quick-nav/candidates': [{ path: '/task-center/goal' }],
    '/dashboard/tasks': [{ type: 'EXERCISE', title: '今日运动' }, { type: 'READ', title: '今日阅读' }],
    '/dashboard/card/EXERCISE': { type: 'EXERCISE', title: '今日运动', value: '3', totalValue: '10' },
    '/dashboard/card/READ': { type: 'READ', title: '今日阅读', value: '30', totalValue: '90' },
    '/quick-nav/my': [], '/thought/dashboard': [{ id: 'thought-1', content: '模拟长文本闪念，用来检查排序过程中卡片高度和后续内容位置。', createTime: '2026-10-05 12:00' }],
    '/taskDetails/watched': [], '/exerciseRecord/dashboardSummary': { days: [] },
    '/timeTrackerCategory/list': [], '/timeRecord/query': [],
    '/goals': [{ id: '9223372036854775801', title: '固定目标', type: 1, status: 'in_progress', isPinned: 1, targetValue: 12, currentValue: 3 }],
    ...extra,
  };
  for (const [path, data] of Object.entries(fixtures)) {
    const handler = route => { calls.push(new URL(route.request().url()).pathname); return route.fulfill({ json: { rscode: '0', data } }); };
    await page.route('**/api' + path, handler);
    await page.route('**/api' + path + '?*', handler);
  }
  await page.route('**/api/home/cards', route => route.fulfill({ json: { rscode: '0', data: cards } }));
  await page.route('**/api/home/cards/order', async route => {
    const payload = route.request().postDataJSON(); writes.push(payload);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (fail) { await route.fulfill({ json: { rscode: '1', result: '模拟排序失败' } }); settled++; return; }
    cards = cards.map(item => item.group === payload.group ? { ...item, sortOrder: payload.keys.indexOf(item.cardKey) } : item)
      .sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder);
    await route.fulfill({ json: { rscode: '0', data: cards } });
    settled++;
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-home-sort' })));
  await page.goto('/#/pages/home/index');
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
  await expect(page.getByRole('button', { name: '调整首页卡片排序', exact: true })).toHaveCount(0);
  return { writes, calls, errors, fail: value => { fail = value; }, waitForSave: () => expect.poll(() => settled).toBe(writes.length) };
}
const visibleOrder = (page, group) => page.locator('.home-order-' + group + ':visible').evaluateAll(rows => rows.map(row => row.dataset.cardKey));
async function drag(page, key, destination, touch = false) {
  const source = page.locator(`[data-card-key="${key}"]`), target = page.locator(`[data-card-key="${destination}"]`);
  await expect(source).toBeVisible(); await expect(target).toBeVisible();
  const a = await source.boundingBox(), b = await target.boundingBox();
  const start = { identifier: 1, clientX: a.x + a.width / 2, clientY: a.y + 20 }, end = { identifier: 1, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
  if (touch) {
    await source.dispatchEvent('touchstart', { touches: [start] });
    await expect(source).toHaveClass(/home-sort-lifted/);
    await source.dispatchEvent('touchmove', { touches: [end] });
    await expect(target).toHaveClass(/home-sort-target/);
    await source.dispatchEvent('touchend', { touches: [], changedTouches: [end] });
  } else {
    await page.mouse.move(start.clientX, start.clientY); await page.mouse.down();
    await expect(source).toHaveClass(/home-sort-lifted/);
    await page.mouse.move(end.clientX, end.clientY, { steps: 12 }); await page.mouse.up();
  }
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页卡片分组拖动、失败恢复和刷新保留 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 }); await page.emulateMedia({ colorScheme: theme });
    const fixture = await setup(page);
    const summary = page.locator('[data-card-key="overview.exercise"] .overview-card');
    const detailCalls = fixture.calls.filter(path => path === '/api/dashboard/card/EXERCISE').length;
    await summary.click();
    await expect.poll(() => fixture.calls.filter(path => path === '/api/dashboard/card/EXERCISE').length).toBe(detailCalls + 1);
    await expect(summary).toHaveAttribute('aria-busy', 'false');
    expect(fixture.writes).toEqual([]);
    const shortSwipe = page.locator('[data-card-key="overview.exercise"]');
    await shortSwipe.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 100, clientY: 40 }] });
    await shortSwipe.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 100, clientY: 75 }] });
    await shortSwipe.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 100, clientY: 75 }] });
    await expect(shortSwipe).not.toHaveClass(/home-sort-lifted/);
    expect(fixture.writes).toEqual([]);
    const before = fixture.calls.length;
    const instance = await page.locator('[data-card-key="section.goal"]').elementHandle();
    await drag(page, 'overview.exercise', 'overview.read', true);
    await expect.poll(() => visibleOrder(page, 'overview')).toEqual(['overview.read', 'overview.exercise']);
    expect(fixture.writes[0]).toMatchObject({ group: 'overview' }); expect(fixture.writes[0].keys).toHaveLength(5);
    await expect(page.locator('.home-sort-saving')).toHaveCount(0);
    await fixture.waitForSave();
    const oldSections = await visibleOrder(page, 'section');
    await page.locator('[data-card-key="section.goal"]').scrollIntoViewIfNeeded();
    await drag(page, 'section.goal', 'section.thoughts');
    await expect.poll(() => visibleOrder(page, 'section')).toEqual(oldSections.map(key => key === 'section.goal' ? 'section.thoughts' : key === 'section.thoughts' ? 'section.goal' : key));
    expect(fixture.writes.at(-1).keys).toHaveLength(11);
    expect(await instance.evaluate(node => node.isConnected)).toBe(true);
    expect(fixture.calls.length).toBe(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await fixture.waitForSave();
    fixture.fail(true);
    const saved = await visibleOrder(page, 'section');
    await page.locator('[data-card-key="section.goal"]').press('Alt+ArrowDown');
    await expect.poll(() => fixture.writes.length).toBe(3);
    await expect(page.getByText('模拟排序失败', { exact: true })).toBeVisible();
    await expect(page.locator('.home-sort-saving')).toHaveCount(0);
    expect(await visibleOrder(page, 'section')).toEqual(saved);
    await page.screenshot({ path: info.outputPath('sorting.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
    expect(await visibleOrder(page, 'overview')).toEqual(['overview.read', 'overview.exercise']);
    expect(await visibleOrder(page, 'section')).toEqual(saved);
    expect(fixture.errors).toEqual([]);
  });
}

test('整卡长按边缘自动滚动，取消不保存，释放只保存一次', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const fixture = await setup(page);
  const scroller = page.locator('.dashboard-scroll > .uni-scroll-view > .uni-scroll-view');
  const source = page.locator('[data-card-key="section.time"]');
  const box = await source.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20); await page.mouse.down();
  await expect(source).toHaveClass(/home-sort-lifted/);
  await page.mouse.move(box.x + box.width / 2, 620, { steps: 12 });
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
  await source.dispatchEvent('touchcancel', {}); await page.mouse.up();
  expect(fixture.writes).toEqual([]);
  await scroller.evaluate(el => { el.scrollTop = 0; });
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
  const again = await source.boundingBox();
  await page.mouse.move(again.x + again.width / 2, again.y + 20); await page.mouse.down();
  await expect(source).toHaveClass(/home-sort-lifted/);
  await page.mouse.move(again.x + again.width / 2, 620, { steps: 12 });
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
  await page.mouse.up();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(page.locator('.home-sort-saving')).toHaveCount(0);
  expect(fixture.writes[0].keys).toHaveLength(11);
  await fixture.waitForSave();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('操作按钮长按不触发整卡排序，编辑弹窗保持正常交互', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  const fixture = await setup(page);
  const button = page.getByRole('button', { name: '新增目标', exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await expect(page.locator('.home-sort-lifted')).toHaveCount(0);
  await page.mouse.up();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const input = dialog.locator('[aria-label="标题"] input');
  await input.fill('正常编辑');
  await expect(input).toHaveValue('正常编辑');
  expect(fixture.writes).toEqual([]);
});

test('拖动松手立即保留新顺序，保存中无 loading，成功静默，失败回退', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  const fixture = await setup(page);
  await expect(page.locator('.card-progress')).toHaveCount(0);
  const loadingBefore = await page.getByRole('status').count();
  let release, fail = false, writes = 0;
  await page.route('**/api/home/cards/order', async route => {
    writes++;
    const payload = route.request().postDataJSON();
    await new Promise(resolve => { release = resolve; });
    if (fail) return route.fulfill({ json: { rscode: '1', result: '模拟排序失败' } });
    const cards = homeCardFixture().map(item => item.group === payload.group
      ? { ...item, sortOrder: payload.keys.indexOf(item.cardKey) } : item)
      .sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder);
    return route.fulfill({ json: { rscode: '0', data: cards } });
  });
  const card = page.locator('[data-card-key="overview.exercise"]');
  const content = await card.locator('.overview-card').elementHandle();
  await drag(page, 'overview.exercise', 'overview.read', true);
  await expect.poll(() => writes).toBe(1);
  expect(await page.getByRole('status').count()).toBe(loadingBefore);
  await expect(page.locator('.home-sort-saving, .card-progress')).toHaveCount(0);
  expect(await content.evaluate(node => node.isConnected)).toBe(true);
  expect(await visibleOrder(page, 'overview')).toEqual(['overview.read', 'overview.exercise']);
  const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/home/cards/order');
  release();
  await response;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => visibleOrder(page, 'overview')).toEqual(['overview.read', 'overview.exercise']);
  await expect(page.locator('uni-toast')).toHaveCount(0);
  const saved = await visibleOrder(page, 'overview');
  fail = true;
  await drag(page, 'overview.read', 'overview.exercise', true);
  await expect.poll(() => writes).toBe(2);
  expect(await visibleOrder(page, 'overview')).toEqual(['overview.exercise', 'overview.read']);
  await expect(page.locator('.home-sort-saving, .card-progress')).toHaveCount(0);
  release();
  await expect(page.getByText('模拟排序失败', { exact: true })).toBeVisible();
  expect(await visibleOrder(page, 'overview')).toEqual(saved);
  expect(fixture.errors).toEqual([]);
});

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`不等高卡片拖动让位，预览占位与松手位置一致 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ colorScheme: theme });
    const fixture = await setup(page, {
      '/quick-nav/candidates': [{ path: '/task-center/goal' }, { path: '/my-hub/read-record' }],
      '/read-record/page': { items: [
        { id: 'read-1', title: '模拟在读书籍', status: 'in_progress' },
        ...[2, 3, 4].map(id => ({ id: 'read-' + id, title: '模拟想读书籍 ' + id, status: 'not_started' })),
      ], total: '4' },
      '/exerciseRecord/dashboardSummary': { hasMore: false, days: [1, 2, 3].map(day => ({ date: '2026-10-0' + day, items: [{ exerciseTypeId: 'walk', typeLabel: '散步', count: day * 20, trend: [] }] })) },
    });
    const source = page.locator('[data-card-key="section.reading"]');
    const target = page.locator('[data-card-key="section.goal"]');
    await expect(source).toContainText('想读');
    await expect(page.getByRole('status')).toHaveCount(0);
    await source.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const a = await source.boundingBox(), b = await target.boundingBox();
    const start = { identifier: 1, clientX: a.x + a.width / 2, clientY: a.y + 20 };
    const point = { identifier: 1, clientX: b.x + b.width / 2, clientY: b.y + b.height / 4 };
    const original = await visibleOrder(page, 'section');
    await source.dispatchEvent('touchstart', { touches: [start] });
    await expect(source).toHaveClass(/home-sort-lifted/);
    await source.dispatchEvent('touchmove', { touches: [point] });
    await expect(source.locator('.home-sort-placeholder')).toBeVisible();
    const preview = await visibleOrder(page, 'section');
    expect(preview.indexOf('section.reading')).toBe(preview.indexOf('section.goal') - 1);
    expect(preview).not.toEqual(original);
    const slot = await source.boundingBox();
    await page.screenshot({ path: info.outputPath('dragging.png'), fullPage: true });
    // Compare in scroll-content coordinates so viewport scrolling does not change the result.
    const scroll = page.locator('.dashboard-scroll > .uni-scroll-view > .uni-scroll-view');
    const scrollTop = await scroll.evaluate(el => el.scrollTop);
    await source.dispatchEvent('touchend', { touches: [], changedTouches: [point] });
    await expect(source).not.toHaveClass(/home-sort-lifted/);
    expect(await visibleOrder(page, 'section')).toEqual(preview);
    expect(await source.boundingBox()).toMatchObject({ height: slot.height });
    const after = await source.boundingBox(), finalScroll = await scroll.evaluate(el => el.scrollTop);
    expect(Math.abs(after.x - slot.x)).toBeLessThan(1);
    expect(Math.abs(after.y + finalScroll - slot.y - scrollTop)).toBeLessThan(1);
    await expect(source.locator('.home-sort-placeholder')).toHaveCount(0);
    await fixture.waitForSave();
    await page.screenshot({ path: info.outputPath('dropped.png'), fullPage: true });
    expect(fixture.errors).toEqual([]);
  });
}
