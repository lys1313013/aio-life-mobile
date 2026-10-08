const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');
const id = '9223372036854775807';
const entries = [
  { key: 'read', label: '阅读', base: '/read-record', title: '模拟长书名：阅读明细与进度', type: 1, status: 'in_progress', currentProgress: 32, totalProgress: 180, author: '模拟作者', remark: '详情中保留的书评', url: '' },
  { key: 'movie', label: '观影', base: '/movie', title: '模拟电影：长片名的详情编辑', type: 2, status: 'in_progress', currentProgress: 4, totalProgress: 24, director: '模拟导演', remark: '详情中保留的影评', url: '' },
  { key: 'member', label: '会员', base: '/membership', name: '模拟订阅', provider: '模拟平台', category: 'other', startDate: '2026-01-31', expiryDate: '2030-01-31', billingCycle: 'month', price: 20, monthlyAmount: 20, autoRenew: 1, note: '完整详情备注', color: '#722ed1' },
  { key: 'anniversary', label: '纪念日', base: '/anniversaryRecords', title: '模拟周年纪念', targetDate: '2027-02-14', isPinned: 1, icon: '🎉', note: '完整纪念日备注', color: 'from-pink-400 to-rose-500' },
];
async function setup(page) {
  const state = { rows: entries.map(({ key, label, base, ...row }) => ({ ...row, id })), writes: [], failDetail: false, failSave: false, waitDetail: null };
  const fixtures = {
    '/home/cards': homeCardFixture(), '/user/info': { id: 'fixture-user', nickname: '模拟用户' },
    '/auth/secondary-lock/menus': [], '/menu/all': [],
    '/menu/visuals': { menus: [], cards: {} },
    '/quick-nav/candidates': ['/my-hub/read-record', '/my-hub/movie', '/membership', '/my-hub/anniversary'].map(path => ({ path })),
    '/dashboard/tasks': [], '/quick-nav/my': [], '/thought/dashboard': [], '/taskDetails/watched': [],
    '/exerciseRecord/dashboardSummary': { days: [] }, '/timeTrackerCategory/list': [], '/timeRecord/query': [],
    '/membership/providers': [],
  };
  for (const [path, data] of Object.entries(fixtures)) {
    for (const suffix of ['', '?*']) await page.route('**/api' + path + suffix, route => route.fulfill({ json: { code: 0, data } }));
  }
  for (const [index, entry] of entries.entries()) {
    const list = route => route.fulfill({ json: { code: 0, data: entry.key === 'read' || entry.key === 'movie'
      ? { items: state.rows[index] ? [state.rows[index]] : [], total: state.rows[index] ? 1 : 0 }
      : state.rows[index] ? [state.rows[index]] : [] } });
    const path = entry.base + (entry.key === 'member' ? '/list' : entry.key === 'anniversary' ? '' : '/page');
    for (const suffix of ['', '?*']) await page.route('**/api' + path + suffix, list);
    await page.route('**/api' + entry.base + '/' + id, async route => {
      if (state.waitDetail) await state.waitDetail;
      if (state.failDetail) return route.fulfill({ json: { code: 1, message: '模拟详情加载失败' } });
      if (route.request().method() === 'DELETE') { state.rows[index] = null; return route.fulfill({ json: { code: 0, data: true } }); }
      await route.fulfill({ json: { code: 0, data: state.rows[index] } });
    });
    await page.route('**/api' + entry.base, async route => {
      if (route.request().method() === 'GET') return list(route);
      const payload = route.request().postDataJSON(); state.writes.push(payload);
      if (state.failSave) return route.fulfill({ json: { code: 1, message: '模拟保存失败' } });
      state.rows[index] = { ...state.rows[index], ...payload };
      await route.fulfill({ json: { code: 0, data: state.rows[index] } });
    });
  }
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-home-detail' })));
  await page.goto('/#/pages/home/index');
  await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(1);
  return state;
}
async function open(page, entry) {
  await page.locator(`[aria-label="${entry.label}首页卡片"]`).getByRole('button', { name: '编辑' + (entry.title || entry.name), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[aria-label="' + (entry.key === 'anniversary' ? '标题' : '名称') + '"] input')).toHaveValue(entry.title || entry.name);
  await expect(page).toHaveURL(/pages\/home\/index/);
  return dialog;
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页直接明细弹窗 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    for (const entry of entries) {
      const dialog = await open(page, entry);
      await expect.poll(async () => dialog.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(300);
      await expect.poll(async () => dialog.evaluate(el => Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - window.innerHeight / 2))).toBeLessThan(2);
      expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      await page.screenshot({ path: info.outputPath(entry.key + '.png') });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
test('首页详情失败可重试，关闭后忽略晚到响应', async ({ page }) => {
  const state = await setup(page);
  state.failDetail = true;
  const card = page.locator('[aria-label="阅读首页卡片"]');
  await card.getByRole('button', { name: '编辑' + entries[0].title, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('模拟详情加载失败');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  state.failDetail = false;
  await page.getByRole('button', { name: '重试加载详情', exact: true }).click();
  await expect(page.getByRole('dialog').locator('[aria-label="名称"] input')).toHaveValue(entries[0].title);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  let release;
  state.waitDetail = new Promise(resolve => { release = resolve; });
  try {
    await card.getByRole('button', { name: '编辑' + entries[0].title, exact: true }).click();
    await expect(page.getByRole('status', { name: '正在加载记录详情', exact: true })).toBeVisible();
    await page.locator('.modal-mask-loading').click({ position: { x: 8, y: 8 } });
    const response = page.waitForResponse('**/api/read-record/' + id);
    release(); await response;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/pages\/home\/index/);
  } finally { release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); }
});
test('首页纪念日保存失败保留表单，重试后更新原卡片', async ({ page }) => {
  const state = await setup(page);
  const dialog = await open(page, entries[3]);
  await dialog.locator('[aria-label="标题"] input').fill('更新后的模拟纪念日');
  state.failSave = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toContainText('模拟保存失败');
  await expect(dialog.locator('[aria-label="标题"] input')).toHaveValue('更新后的模拟纪念日');
  state.failSave = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[aria-label="纪念日首页卡片"]')).toContainText('更新后的模拟纪念日');
  expect(state.writes.at(-1)).toMatchObject({ id, note: '完整纪念日备注', isPinned: 1 });
  await expect(page).toHaveURL(/pages\/home\/index/);
});
