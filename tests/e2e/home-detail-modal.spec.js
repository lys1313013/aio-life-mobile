const { test, expect } = require('./support/test');
const { homeCardFixture } = require('./home-card-fixture');
const { waitForMotion } = require('./support/motion');
const spacing = require('../../src/styles/spacing.json');
const id = '9223372036854775807';
const coverId = '013f8595-bfbb-463c-ade1-c77c8821b30f';
const entries = [
  { key: 'read', label: '阅读', base: '/read-record', title: '模拟长书名：阅读明细与进度', type: 1, status: 'in_progress', currentProgress: 32, totalProgress: 180, author: '模拟作者', remark: '把枯燥的时间线写成了鲜活的故事。下次读到城市变迁的章节，想回头对照前面的地图。', url: '', fileId: coverId, startDate: '2026-11-12' },
  { key: 'movie', label: '观影', base: '/movie', title: '模拟电影：长片名的详情编辑', type: 2, status: 'in_progress', currentProgress: 4, totalProgress: 24, director: '模拟导演', remark: '详情中保留的影评', url: '' },
  { key: 'member', label: '会员', base: '/membership', name: '模拟订阅', provider: '模拟平台', category: 'other', startDate: '2026-01-31', expiryDate: '2030-01-31', billingCycle: 'month', price: 20, monthlyAmount: 20, autoRenew: 1, remark: '完整详情备注', color: '#722ed1' },
  { key: 'anniversary', label: '纪念日', base: '/anniversaryRecords', title: '模拟周年纪念', targetDate: '2027-02-14', isPinned: 1, icon: '🎉', remark: '完整纪念日备注', color: 'from-pink-400 to-rose-500' },
];
async function setup(page) {
  const state = { rows: entries.map(({ key, label, base, ...row }) => ({ ...row, id })), writes: [], failDetail: false, failSave: false, waitDetail: null };
  await page.route('**/api/file/preview/' + coverId, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 148"><rect width="100" height="148" fill="#193b41"/><circle cx="74" cy="97" r="19" fill="#d8af6e"/><path d="M0 133l32-39 25 19 43-30v65H0" fill="#315960"/><text x="12" y="30" fill="#f5e6c6" font-size="14">城市手记</text><path d="M12 41h32" stroke="#d8af6e"/></svg>',
  }));
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
async function create(page, entry) {
  await page.locator(`[aria-label="${entry.label}首页卡片"]`).getByRole('button', { name: '新增' + entry.label, exact: true }).click();
  const dialog = entry.key === 'read' ? page.locator('.read-edit-page') : page.getByRole('dialog');
  await expect(dialog.locator(`[aria-label="${entry.key === 'read' ? '书名' : entry.key === 'anniversary' ? '标题' : '名称'}"] input`)).toHaveValue('');
  await expect(page).toHaveURL(entry.key === 'read' ? /read-edit$/ : /pages\/home\/index$/);
  return dialog;
}
async function checkReadingEditor(page, state, entry, info, theme) {
  const editor = page.locator('.read-edit-page');
  const progress = editor.locator('.read-progress');
  const paper = editor.locator('.mobile-page');
  let release;
  state.waitDetail = new Promise(resolve => { release = resolve; });
  let progressTop;
  try {
    const card = page.locator('[aria-label="阅读首页卡片"]');
    await card.getByRole('button', { name: '编辑' + entry.title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('read-edit\\?id=' + id + '$'));
    await expect(editor.getByRole('status', { name: '正在加载记录详情', exact: true })).toBeVisible();
    await waitForMotion(page);
    await expect(editor.getByRole('status', { name: '正在加载豆瓣链接', exact: true }).locator('.form-skeleton-input')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)');
    progressTop = (await progress.boundingBox()).y;
    await page.screenshot({ path: info.outputPath('read-loading.png') });
  } finally {
    release();
    state.waitDetail = null;
  }
  await expect(editor.locator('[aria-label="书名"] input')).toHaveValue(entry.title);
  await expect(editor.locator('[aria-label="类型"]')).toHaveCount(0);
  await expect(editor.locator('[aria-label="书评"] textarea')).toHaveValue(entry.remark);
  await expect(editor.locator('.attachment-image img')).toBeVisible();
  expect(Math.abs((await progress.boundingBox()).y - progressTop)).toBeLessThan(24);
  await expect(paper).toHaveCSS('background-color', theme === 'dark' ? 'rgb(17, 18, 21)' : 'rgb(255, 255, 255)');
  const importField = await editor.locator('.read-link-input').boundingBox();
  const bookFields = await editor.locator('.read-identity').boundingBox();
  const parseButton = await editor.getByRole('button', { name: '解析豆瓣链接', exact: true }).boundingBox();
  expect(importField.y + importField.height).toBeLessThan(bookFields.y);
  expect(importField.y + importField.height).toBeCloseTo(parseButton.y + parseButton.height, 0);
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
  await expect(editor.getByRole('dialog')).toHaveCount(0);
  expect(await editor.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath('read.png') });
  const viewport = page.viewportSize();
  if (viewport.width >= 820) {
    const wide = viewport.width === 820 ? { width: 808, height: 496 } : viewport;
    await page.setViewportSize(wide);
    const link = await editor.locator('.read-link-row').boundingBox();
    const width = spacing.formContentMax - 2 * spacing.page;
    expect(link.width).toBeCloseTo(width, 0);
    expect(link.x).toBeCloseTo((wide.width - width) / 2, 0);
    const identity = await editor.locator('.read-identity').boundingBox();
    const status = await editor.locator('.read-status').boundingBox();
    expect(status.y).toBeGreaterThanOrEqual(identity.y + identity.height);
    const save = editor.getByRole('button', { name: '保存', exact: true });
    const cancel = editor.getByRole('button', { name: '取消', exact: true });
    await expect(save).toBeInViewport({ ratio: 1 });
    await expect(cancel).toBeInViewport({ ratio: 1 });
    const saveBox = await save.boundingBox();
    expect(saveBox.x + saveBox.width).toBeCloseTo(link.x + link.width, 0);
    await expect.poll(async () => (await editor.getByRole('button', { name: '返回', exact: true }).boundingBox()).x).toBeCloseTo(link.x, 0);
    if (wide.height === 496) {
      await page.screenshot({ path: info.outputPath('read-wide-short.png') });
      await page.mouse.move(wide.width / 2, wide.height / 2);
      await page.mouse.wheel(0, 750);
      await expect(editor.locator('[aria-label="书评"] textarea')).toBeInViewport({ ratio: 1 });
      await expect(save).toBeInViewport({ ratio: 1 });
      await page.setViewportSize(viewport);
    }
  }
  if (viewport.width === 390) {
    await page.setViewportSize({ width: 390, height: 620 });
    await expect(editor.locator('[aria-label="书评"] textarea')).not.toBeInViewport();
    await page.mouse.move(190, 290);
    await page.mouse.wheel(0, 470);
    await expect(editor.locator('[aria-label="书评"] textarea')).toBeInViewport();
    await expect(editor.getByRole('button', { name: '返回', exact: true })).toBeInViewport();
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    await page.setViewportSize(viewport);
  }
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/pages\/home\/index$/);
  await create(page, entry);
  await waitForMotion(page);
  await expect(editor.locator('.read-cover-art img')).toHaveJSProperty('complete', true);
  await expect.poll(() => editor.locator('.read-cover-art img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  const activeStatus = editor.getByRole('button', { name: '想读', exact: true });
  const option = await activeStatus.boundingBox();
  const label = await activeStatus.locator('.read-status-label').boundingBox();
  expect(Math.abs((label.x + label.width / 2) - (option.x + option.width / 2))).toBeLessThan(2);
  expect(Math.abs((label.y + label.height / 2) - (option.y + option.height / 2))).toBeLessThan(2);
  const toggle = editor.getByRole('button', { name: '阅读进度', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: info.outputPath('read-create.png') });
  const titleField = editor.locator('.form-field').filter({ has: page.locator('input[aria-label="书名"]') });
  const titleHint = titleField.getByRole('alert');
  await expect(titleHint).toHaveCount(0);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(titleHint).toHaveText('请输入书名');
  await expect(editor.locator('.read-edit-footer').getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('read-title-error.png') });
  await titleField.locator('input').fill('  ');
  await expect(titleHint).toBeVisible();
  await titleField.locator('input').fill('模拟书名');
  await expect(titleHint).toHaveCount(0);
  await expect(titleField.locator('input')).toBeFocused();
  await editor.getByRole('button', { name: '在读', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const pagesRead = editor.locator('[aria-label="已读页数"] input');
  await pagesRead.fill('12');
  await toggle.click();
  await expect(pagesRead).toHaveCount(0);
  await toggle.click();
  await expect(pagesRead).toHaveValue('12');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor).toHaveCount(0);
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页直接打开明细 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const state = await setup(page);
    for (const entry of entries) {
      if (entry.key === 'read') {
        await page.setViewportSize({ width, height: 844 });
        await checkReadingEditor(page, state, entry, info, theme);
        await page.setViewportSize({ width, height: 1000 });
        continue;
      }
      let release; state.waitDetail = new Promise(resolve => { release = resolve; });
      let pendingBox, pendingSave;
      try {
        await page.locator(`[aria-label="${entry.label}首页卡片"]`).getByRole('button', { name: '编辑' + (entry.title || entry.name), exact: true }).click();
        await expect(page.getByRole('status', { name: '正在加载记录详情', exact: true })).toBeVisible();
        await expect.poll(async () => (await page.getByRole('dialog').boundingBox()).height).toBeGreaterThan(300);
        await waitForMotion(page);
        pendingBox = await page.getByRole('dialog').boundingBox();
        const field = page.getByRole('dialog').locator('.form-skeleton-input').first();
        await expect(field).toHaveCSS('border-top-style', 'solid');
        await expect(field).toHaveCSS('background-color', theme === 'dark' ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)');
        if (entry.key === 'anniversary') pendingSave = await page.locator('.form-skeleton-button').last().boundingBox();
        await page.screenshot({ path: info.outputPath(entry.key + '-loading.png') });
      } finally { release(); state.waitDetail = null; }
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[aria-label="' + (entry.key === 'anniversary' ? '标题' : '名称') + '"] input')).toHaveValue(entry.title || entry.name);
      await expect.poll(async () => Math.abs((await dialog.boundingBox()).height - pendingBox.height)).toBeLessThan(55);
      await expect.poll(async () => dialog.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(300);
      await expect.poll(async () => dialog.evaluate(el => Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - window.innerHeight / 2))).toBeLessThan(2);
      if (pendingSave) {
        const save = dialog.getByRole('button', { name: '保存', exact: true });
        await expect.poll(async () => Math.abs((await save.boundingBox()).y - pendingSave.y)).toBeLessThan(2);
      }
      expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      await page.screenshot({ path: info.outputPath(entry.key + '.png') });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    for (const entry of entries.filter(item => ['anniversary', 'movie'].includes(item.key))) {
      const dialog = await create(page, entry);
      await expect.poll(async () => dialog.evaluate(el => Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - window.innerHeight / 2))).toBeLessThan(2);
      expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      await page.screenshot({ path: info.outputPath(entry.key + '-create.png') });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/pages\/home\/index$/);
    }
    expect(errors).toEqual([]);
  });
}
for (const entry of entries.filter(item => ['anniversary', 'movie', 'read'].includes(item.key))) {
  test(`首页新增${entry.label}失败保留表单，重试后刷新本卡`, async ({ page }) => {
    const state = await setup(page);
    const businessPageRequests = [];
    page.on('request', request => {
      if (/pages-records-(anniversary|library)/.test(request.url())) businessPageRequests.push(request.url());
    });
    const dialog = await create(page, entry);
    const input = dialog.locator(`[aria-label="${entry.key === 'read' ? '书名' : entry.key === 'anniversary' ? '标题' : '名称'}"] input`);
    const title = '首页新增模拟' + entry.label;
    await input.fill(title);
    state.failSave = true;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toContainText('模拟保存失败');
    await expect(input).toHaveValue(title);
    await expect(page).toHaveURL(entry.key === 'read' ? /read-edit$/ : /pages\/home\/index$/);
    state.failSave = false;
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const payload = state.writes.at(-1);
    expect(payload).not.toHaveProperty('id');
    expect(payload.title).toBe(title);
    if (entry.key === 'read' || entry.key === 'movie') expect(payload.fileId).toBeNull();
    if (entry.key === 'read') expect(payload).not.toHaveProperty('type');
    if (entry.key === 'anniversary') expect(payload.isPinned).toBe(1);
    else expect(payload.status).toBe('not_started');
    await expect(page.locator(`[aria-label="${entry.label}首页卡片"]`).getByRole('button', { name: '编辑' + title, exact: true })).toBeVisible();
    await expect(page).toHaveURL(/pages\/home\/index$/);
    expect(businessPageRequests).toEqual([]);
    // 标题仍保留进入完整业务列表的入口。
    await page.getByRole('button', { name: '查看全部' + entry.label, exact: true }).click();
    await expect(page).toHaveURL(entry.key === 'anniversary' ? /pages\/records\/anniversary$/ : new RegExp('pages/records/library\\?kind=' + entry.key + '$'));
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('region', { name: '编辑阅读记录' }).locator('[aria-label="书名"] input')).toHaveValue(entries[0].title);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  let release;
  state.waitDetail = new Promise(resolve => { release = resolve; });
  try {
    await card.getByRole('button', { name: '编辑' + entries[0].title, exact: true }).click();
    await expect(page.getByRole('status', { name: '正在加载记录详情', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    const response = page.waitForResponse('**/api/read-record/' + id);
    release(); await response;
    await expect(page.locator('.read-edit-page')).toHaveCount(0);
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
  expect(state.writes.at(-1)).toMatchObject({ id, remark: '完整纪念日备注', isPinned: 1 });
  await expect(page).toHaveURL(/pages\/home\/index/);
});
