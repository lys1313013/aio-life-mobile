const { test, expect } = require('./support/test');
const fs = require('node:fs');
const { pullDown } = require('./gestures');
const out = 'artifacts/users-layout';
fs.mkdirSync(out, { recursive: true });
test.use({ hasTouch: true });

function user(i) {
  return { id: String(9223372036854775000n + BigInt(i)), username: 'fixture_' + i,
    nickname: ['生活记录者', '山间来信', '向晚'][i % 3], role: i % 3 === 0 ? 'admin' : 'user',
    email: i === 1 ? '' : `fixture-${i}@example.test`, isOnline: i % 2 === 0,
    lastActiveTime: i === 1 ? null : '2026-10-21 09:42:15', createTime: '2026-08-18 10:09:06' };
}
async function setup(page, { count = 3, dark = false, delay = 0, long = false } = {}) {
  const state = { rows: Array.from({ length: count }, (_, i) => user(i)), queries: [], writes: [], delay, fail: false, failWrite: false, failMore: false };
  if (long && state.rows.length) Object.assign(state.rows.at(-1), { nickname: '这是一位昵称特别长的模拟用户用于检查换行后的信息与按钮布局', username: 'very_long_username_for_responsive_layout_without_spaces', email: 'long.email.address.for.layout.verification@example.test' });
  await page.addInitScript(dark => {
    localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'users-layout-fixture' }));
    localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: dark ? 'dark' : 'light' }));
  }, dark);
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const ok = data => route.fulfill({ json: { code: 0, message: null, data } });
    const fail = message => route.fulfill({ json: { code: 1, message, data: null } });
    if (path === '/api/user/info') return ok({ id: '1', roles: ['admin'] });
    if (path === '/api/user-center/list') {
      const q = Object.fromEntries(url.searchParams); state.queries.push(q);
      const wait = state.delay; if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (state.fail || (state.failMore && q.page === '2')) return fail('模拟加载失败');
      const rows = state.rows.filter(row => !q.keyword || [row.username, row.nickname].some(value => value.includes(q.keyword)));
      const start = (Number(q.page) - 1) * Number(q.pageSize);
      return ok({ items: rows.slice(start, start + Number(q.pageSize)), total: rows.length });
    }
    if (path.startsWith('/api/user-center')) {
      const body = req.postDataJSON(); state.writes.push({ path, method: req.method(), body });
      if (state.failWrite) return fail('模拟保存失败');
      if (req.method() === 'DELETE') state.rows = state.rows.filter(row => !path.endsWith('/' + row.id));
      if (req.method() === 'PUT') state.rows = state.rows.map(row => row.id === body.id ? { ...row, ...body } : row);
      if (req.method() === 'POST') state.rows.unshift({ ...user(99), ...body });
      return ok(true);
    }
    return ok([]);
  });
  await page.goto('/#/pages/admin/index?kind=users');
  return state;
}
async function ready(page, count = 3) {
  await expect(page.locator('.user-card-loading')).toHaveCount(0);
  await expect(page.locator('.user-card')).toHaveCount(count);
}
async function box(page) { return page.locator('.user-results').boundingBox(); }

for (const width of [390, 820, 1440]) for (const dark of [false, true]) {
  test(`用户卡片、长文本和编辑弹窗 ${width} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await setup(page, { dark, long: true }); await ready(page);
    await expect(page.getByText('管理员', { exact: true })).toBeVisible();
    await expect(page.getByText('未设置邮箱')).toBeVisible();
    await expect(page.getByRole('img', { name: '在线', exact: true })).toHaveCount(2);
    const cards = await page.locator('.user-card').evaluateAll(els => els.map(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, width: b.width }; }));
    expect(cards.every(card => card.x >= 12 && card.right <= width - 12)).toBe(true);
    if (width >= 700) expect(cards[0].y).toBe(cards[1].y);
    else expect(cards[1].y).toBeGreaterThan(cards[0].y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/${width}-${dark ? 'dark' : 'light'}.png` });
    await page.locator('.user-card').first().getByRole('button', { name: '编辑', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '用户中心', exact: true });
    await expect(modal.getByRole('textbox', { name: '昵称', exact: true })).toHaveValue('生活记录者');
    const b = await modal.boundingBox(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `${out}/${width}-${dark ? 'dark' : 'light'}-edit.png` });
  });
}

test('搜索、重置、新增、编辑失败恢复与删除确认保留字符串 ID', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page); await ready(page);
  const search = page.getByRole('searchbox', { name: '用户名 / 昵称', exact: true });
  await search.fill('山间'); await search.press('Enter'); await ready(page, 1);
  expect(state.queries.at(-1).keyword).toBe('山间');
  await page.getByRole('button', { name: '重置筛选' }).click(); await ready(page);
  await page.locator('.user-card').first().getByRole('button', { name: '编辑', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '用户中心', exact: true });
  await modal.getByRole('textbox', { name: '昵称', exact: true }).fill('更新后的模拟昵称');
  state.failWrite = true; await modal.getByRole('button', { name: '保存', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('模拟保存失败');
  await expect(modal.getByRole('textbox', { name: '昵称', exact: true })).toHaveValue('更新后的模拟昵称');
  state.failWrite = false; await modal.getByRole('button', { name: '保存', exact: true }).click();
  await expect(modal).toHaveCount(0); await expect(page.locator('.user-name').first()).toHaveText('更新后的模拟昵称');
  expect(state.writes.at(-1).body.id).toBe('9223372036854775000');
  await page.locator('.user-card').first().getByRole('button', { name: '删除', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '删除', exact: true });
  await expect(confirm).toContainText('更新后的模拟昵称');
  await page.screenshot({ path: `${out}/390-light-confirm.png` });
  await confirm.getByRole('button', { name: '确认', exact: true }).click(); await ready(page, 2);
  expect(state.writes.at(-1).path).toBe('/api/user-center/9223372036854775000');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await modal.getByRole('textbox', { name: '用户名', exact: true }).fill('new_fixture');
  await modal.getByRole('textbox', { name: '昵称', exact: true }).fill('新增模拟用户');
  await modal.getByRole('button', { name: '保存', exact: true }).click(); await ready(page);
  await expect(page.locator('.user-name').first()).toHaveText('新增模拟用户');
});

for (const count of [0, 1, 3]) test(`延迟加载、刷新和重试布局 ${count} 条`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page, { count, delay: 600 });
  await expect(page.locator('.user-card-loading')).toHaveCount(3);
  const skeleton = await page.locator('.user-card').first().boundingBox();
  await page.screenshot({ path: `${out}/390-loading-${count}.png` });
  await ready(page, count);
  if (count) {
    const loaded = await page.locator('.user-card').first().boundingBox();
    expect(Math.abs(skeleton.height - loaded.height)).toBeLessThanOrEqual(4);
  }
  const before = await box(page), queries = state.queries.length;
  await pullDown(page, '.mobile-page-scroll');
  await expect.poll(() => state.queries.length).toBeGreaterThan(queries);
  await expect(page.getByRole('status', { name: '正在更新用户' })).toBeVisible();
  expect((await box(page)).height).toBe(before.height);
  await expect(page.getByRole('status', { name: '正在更新用户' })).toHaveCount(0);
  state.fail = true; await pullDown(page, '.mobile-page-scroll');
  await expect(page.getByRole('alert')).toContainText('模拟加载失败');
  expect((await box(page)).height).toBe(before.height);
  state.fail = false; await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0); await ready(page, count);
});

test('触底分页保留列表、失败重试与末页停止', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page, { count: 23 }); await ready(page, 20);
  state.failMore = true;
  const scroll = page.locator('.mobile-page-scroll .uni-scroll-view').last();
  // uni-app 首次 scrolltolower 有 200ms 节流，先等初始化窗口结束再实际滚动。
  await page.waitForTimeout(250);
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  await expect(page.locator('.user-card')).toHaveCount(20);
  state.failMore = false; await page.getByRole('button', { name: '重试加载' }).click(); await ready(page, 23);
  expect(state.queries.map(q => q.page)).toEqual(['1', '2', '2']);
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  expect(state.queries).toHaveLength(3);
});
