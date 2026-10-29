const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./support/test');
const keys = ['memo', 'finance', 'video', 'device', 'income', 'expense'];
const titles = ['最近笔记', '收支概览', '视频', '我的设备', '收入', '支出'];
const routes = ['/my-hub/memo', '/finance-management/dashboard', '/finance-management/income', '/finance-management/expense', '/my-hub/videoWatch', '/my-hub/device'];
const { calendarFixture } = require('./fixtures-finance-calendar');
async function setup(page, { count = 3, delay = 0, locked = false, fail = false, enabled = true } = {}) {
  const calls = [], imageHeaders = []; let failure = fail;
  const data = {
    memo: { items: Array.from({ length: count }, (_, i) => ({ id: '922337203685477580' + i, title: '笔记' + i + ' 关于本周读书和工作计划的长标题', hiddenContent: i === 0, updateTime: '2026-10-22 10:00:00', content: '不允许泄漏的笔记正文' })), refreshInterval: 300 },
    finance: { period: 'month', label: '2026年10月', month: '2026-10', income: 12345.67, expense: 2345.67, balance: 10000, refreshInterval: 300 },
    income: { period: 'month', label: '2026年10月', month: '2026-10', amount: 12345.67, refreshInterval: 300 },
    expense: { period: 'month', label: '2026年10月', month: '2026-10', amount: 2345.67, refreshInterval: 300 },
    video: { items: Array.from({ length: count }, (_, i) => ({ id: 'video-' + i, title: '视频' + i, coverFileId: 'video-cover-' + i, coverState: 'READY', currentEpisode: 3, episodes: 10, progressPercent: 25, resumeUrl: 'https://www.bilibili.com/video/BV1234567890?p=3' })), refreshInterval: 300 },
    device: { items: Array.from({ length: count }, (_, i) => ({ id: 'device-' + i, name: '设备' + i, fileId: 'device-photo-' + i, usageDays: 200, dailyCost: 12.3 })), refreshInterval: 600 },
  };
  const fixtures = {
    '/home/cards': keys.map((key, sortOrder) => ({ cardKey: 'section.' + key, title: titles[sortOrder], group: 'section', isEnabled: enabled, sortOrder })),
    '/menu/visuals': { menus: [], cards: {} }, '/user/info': { id: 'fixture-user', nickname: '测试用户' }, '/dashboard/tasks': [],
    '/auth/secondary-lock/menus': locked ? ['finance-expense'] : [],
    '/menu/all': routes.map((path, i) => ({ path, meta: { menuId: i === 3 ? 'finance-expense' : 'menu-' + i } })),
    '/quick-nav/candidates': routes.map(path => ({ path })),
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); const path = url.pathname.replace('/api', ''); calls.push(path);
    if (path === '/auth/secondary-verify') {
      const body = route.request().postDataJSON();
      expect(body.menuPath).toBe('/finance-management/expense');
      return route.fulfill({ json: body.password === '001234'
        ? { code: 0, message: null, data: { menuPath: body.menuPath } }
        : { code: 1, message: '二级密码错误', data: null } });
    }
    if (path.startsWith('/file/preview/')) {
      imageHeaders.push(route.request().headers().authorization);
      const video = path.includes('video');
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="88"><rect width="144" height="88" fill="' + (video ? '#87a9c7' : '#a8b4a2') + '"/><rect x="30" y="18" width="84" height="52" rx="8" fill="#edf2f8"/><path d="M65 31L85 44L65 57Z" fill="#657d96"/></svg>' });
    }
    if (path.startsWith('/home/sections/')) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return route.fulfill({ json: failure ? { code: 1, message: '模拟摘要失败' } : { code: 0, data: path.endsWith('/calendar') ? calendarFixture(url, path.split('/')[3], count) : data[path.split('/').pop()] } });
    }
    return route.fulfill({ json: { code: 0, data: fixtures[path] ?? [] } });
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-summary' })));
  await page.goto('/#/pages/home/index');
  return { calls, imageHeaders, recover: () => { failure = false; }, data };
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`六张摘要卡图片与三条长标题与加载刷新布局 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const fixture = await setup(page, { delay: 700 });
    const memo = page.locator('[aria-label="最近笔记首页卡片"]');
    await expect(memo.getByRole('status')).toBeVisible();
    const loadingBox = await memo.boundingBox();
    const videoBefore = await page.locator('[aria-label="视频首页卡片"]').boundingBox();
    const deviceBefore = await page.locator('[aria-label="我的设备首页卡片"]').boundingBox();
    await page.screenshot({ path: info.outputPath('summary-loading.png'), fullPage: true });
    await expect(memo).toContainText('正文已隐藏');
    await expect(page.locator('[aria-label="收支概览首页卡片"]')).toContainText('10,000.00');
    await expect(page.locator('[aria-label="我的设备首页卡片"]')).toContainText('使用 200 天');
    expect(await page.locator('body').innerText()).not.toContain('不允许泄漏的笔记正文');
    const loadedBox = await memo.boundingBox(); expect(Math.abs(loadingBox.height - loadedBox.height)).toBeLessThanOrEqual(5);
    await memo.getByRole('button', { name: '刷新最近笔记', exact: true }).click();
    await expect(memo).toContainText('正文已隐藏'); expect((await memo.boundingBox()).height).toBe(loadedBox.height);
    await expect(memo).toHaveAttribute('aria-busy', 'false');
    const images = page.locator('.summary-cover-image img'); await expect(images).toHaveCount(6);
    await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0))).toBe(true);
    expect(fixture.imageHeaders).toEqual(Array(6).fill('Bearer fixture-summary'));
    const folder = path.resolve('artifacts/home-summary'); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, 'summary-' + width + '-' + theme + '.png'), fullPage: true });
    for (const [title, before] of [['视频', videoBefore], ['我的设备', deviceBefore]]) expect(Math.abs((await page.locator('[aria-label="' + title + '首页卡片"]').boundingBox()).height - before.height)).toBeLessThanOrEqual(5);
    if (width === 390) { await page.locator('[aria-label="收入首页卡片"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(folder, 'summary-finance-' + width + '-' + theme + '.png'), fullPage: true }); }
    const overflowing = await memo.evaluate(el => el.scrollWidth > el.clientWidth + 1); expect(overflowing).toBe(false);
  });
}
test('空态仍可新增，刷新保留高度；失败可局部恢复', async ({ page }) => {
  const fixture = await setup(page, { count: 0, fail: true });
  const memo = page.locator('[aria-label="最近笔记首页卡片"]'); await expect(memo).toContainText('模拟摘要失败');
  fixture.recover(); await memo.getByRole('button', { name: '重试最近笔记', exact: true }).click(); await expect(memo).toContainText('还没有笔记');
  const box = await memo.boundingBox(); await memo.getByRole('button', { name: '刷新最近笔记', exact: true }).click(); await expect(memo).toContainText('还没有笔记'); expect((await memo.boundingBox()).height).toBe(box.height);
  await expect(memo.getByRole('button', { name: '新增最近笔记', exact: true })).toBeVisible();
});
test('财务任一底层业务锁住时不请求摘要，关闭卡片完全无业务请求', async ({ page }) => {
  const locked = await setup(page, { locked: true });
  await expect(page.locator('[aria-label="收支概览首页卡片"]').getByRole('button', { name: '解锁收支概览', exact: true })).toBeVisible(); expect(locked.calls).not.toContain('/home/sections/finance/calendar');
  await page.unrouteAll({ behavior: 'wait' }); await page.goto('about:blank'); const disabled = await setup(page, { enabled: false });
  await expect(page.locator('.summary-card')).toHaveCount(0); expect(disabled.calls.filter(path => path.startsWith('/home/sections/'))).toEqual([]);
});
test('最近笔记点击读取完整大整数记录，保存后返回首页更新摘要', async ({ page }) => {
  const fixture = await setup(page, { count: 1 });
  const id = '9223372036854775800'; let detail = { id, title: '笔记完整标题', content: '完整正文需要保留', hiddenContent: true }; let saved;
  await page.route('**/api/memo/query?*', route => route.fulfill({ json: { code: 0, data: { items: [detail], total: 1 } } }));
  await page.route('**/api/memo/' + id, route => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); detail = { ...detail, ...saved }; fixture.data.memo.items[0].title = saved.title; }
    return route.fulfill({ json: { code: 0, data: detail } });
  });
  await page.getByRole('button', { name: /^查看笔记0/ }).click();
  await expect(page).toHaveURL(new RegExp('kind=memo.*id=' + id));
  const editor = page.getByRole('dialog', { name: '编辑笔记' }); await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: '内容', exact: true })).toHaveValue('完整正文需要保留');
  await editor.getByRole('textbox', { name: '标题', exact: true }).fill('修改后的笔记标题');
  await editor.getByRole('button', { name: '保存', exact: true }).click(); await expect(editor).toHaveCount(0);
  expect(fixture.calls).toContain('/home/sections/memo'); expect(saved.content).toBe('完整正文需要保留'); expect(saved.hiddenContent).toBe(true);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('[aria-label="最近笔记首页卡片"]')).toContainText('修改后的笔记标题');
});
test('设备卡片在首页打开指定设备编辑器', async ({ page }) => {
  await setup(page, { count: 1 });
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
  await page.route('**/api/device/device-0', route => route.fulfill({ json: { code: 0, data: { id: 'device-0', name: '设备完整名称', purchasePrice: 2460, purchaseDate: '2026-04-01', remark: '完整配置' } } }));
  await page.getByRole('button', { name: '查看设备0', exact: true }).click();
  await expect(page).toHaveURL(/pages\/home\/index/); const device = page.getByRole('dialog', { name: '编辑设备' }); await expect(device).toBeVisible(); await expect(device.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备完整名称');
  await device.getByRole('button', { name: '取消', exact: true }).click(); await expect(page).toHaveURL(/pages\/home\/index/);

});
test('视频卡片续看打开对应集数且标题进入视频列表', async ({ page, context }) => {
  await setup(page, { count: 1 });
  await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>模拟视频页面</p>' }));
  const popup = context.waitForEvent('page'); await page.getByRole('button', { name: '继续观看视频0', exact: true }).click(); const video = await popup; await video.waitForLoadState(); expect(video.url()).toContain('BV1234567890?p=3'); await video.close();
  await page.route('**/api/b-video/query?*', route => route.fulfill({ json: { code: 0, data: { items: [{ id: 'video-0', title: '完整视频标题', currentEpisode: 3, episodes: 10, status: 'in_progress', duration: 100, watchedDuration: 25 }], total: 1 } } }));
  const card = page.locator('[aria-label="视频首页卡片"]');
  await expect(card.getByRole('button', { name: /^编辑/ })).toHaveCount(0);
  await card.getByRole('button', { name: '查看视频', exact: true }).click(); await expect(page).toHaveURL(/pages\/records\/video$/);
  await expect(page.getByText('完整视频标题', { exact: true })).toBeVisible();
});
test('三财务卡范围切换独立，慢请求与失败保留对应标签和金额', async ({ page }) => {
  await setup(page); const finance = page.locator('[aria-label="收支概览首页卡片"]');
  await expect(finance).toHaveAttribute('aria-busy', 'false'); let release; let failed = false;
  await page.route('**/api/home/sections/finance/calendar?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('granularity') === 'month' && !failed) await new Promise(resolve => { release = resolve; });
    return route.fulfill({ json: failed ? { code: 1, message: '模拟概览失败' } : { code: 0, data: calendarFixture(url, 'finance') } });
  });
  await finance.getByRole('button', { name: '收支概览：月', exact: true }).click(); await expect(finance.getByRole('status')).toBeVisible();
  await expect(finance.getByRole('button', { name: '收支概览：周', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await finance.getByRole('button', { name: '收支概览：年', exact: true }).click(); await expect(finance.getByRole('button', { name: '收支概览：年', exact: true })).toHaveAttribute('aria-pressed', 'true'); release();
  failed = true; await finance.getByRole('button', { name: '收支概览：月', exact: true }).click(); await expect(finance).toContainText('模拟概览失败'); await expect(finance.getByRole('button', { name: '收支概览：年', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(finance).toContainText('10,000.00');
  await expect(page.getByRole('button', { name: '收入：周', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '支出：日', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('授权图片失败与无图保持固定占位，重试真正显示图片', async ({ page }) => {
  const fixture = await setup(page, { count: 3 }); const card = page.locator('[aria-label="我的设备首页卡片"]');
  await expect(card.locator('.summary-cover-image img')).toHaveCount(3); const before = await card.locator('.summary-image').first().boundingBox(); let fail = true;
  await page.route('**/api/file/preview/device-photo-fail', route => fail ? route.fulfill({ status: 503, body: 'failed' }) : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="green"/></svg>' }));
  fixture.data.device.items[0].fileId = 'device-photo-fail'; fixture.data.device.items[1].fileId = null;
  await card.getByRole('button', { name: '刷新我的设备', exact: true }).click(); await expect(card.getByRole('button', { name: '重试设备0图片', exact: true })).toBeVisible();
  const failed = await card.locator('.summary-image').first().boundingBox(); expect(failed.width).toBe(before.width); expect(failed.height).toBe(before.height); await expect(card.locator('.summary-image').nth(1).locator('.summary-cover-image')).toHaveCount(0);
  fail = false; await card.getByRole('button', { name: '重试设备0图片', exact: true }).click(); await expect.poll(() => card.locator('.summary-image').first().locator('img').evaluateAll(nodes => nodes.length === 1 && nodes[0].naturalWidth > 0)).toBe(true);
});
test('独立收入卡不依赖支出权限，标题进入账本且没有新增加号', async ({ page }) => {
  await setup(page, { locked: true }); const income = page.locator('[aria-label="收入首页卡片"]');
  await expect(income).toContainText('12,345.67'); await expect(page.locator('[aria-label="支出首页卡片"]').getByRole('button', { name: '解锁支出', exact: true })).toBeVisible();
  await expect(income.getByRole('button', { name: '收入：日', exact: true })).toHaveCount(0);
  await expect(income.getByRole('button', { name: '记收入', exact: true })).toHaveCount(0);
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
  await page.route('**/api/income/query?*', route => route.fulfill({ json: { code: 0, data: { items: [], total: 0 } } }));
  await income.getByRole('button', { name: '查看收入', exact: true }).click(); await expect(page).toHaveURL(/pages\/finance\/income/);
});

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页设备原地编辑保存与删除 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(theme => localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme })), theme);
    const fixture = await setup(page, { count: 1 });
    const id = '9223372036854775807';
    fixture.data.device.items[0].id = id;
    let saved;
    const detail = { id, name: '设备0', spec: '完整配置', purchasePrice: null, purchaseDate: null, endDate: null, status: '1', type: '81', purchasePlace: '模拟渠道', remark: '需要保留的备注', fileId: '' };
    await page.route('**/api/*DictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
    await page.route('**/api/device/' + id, async route => {
      if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); Object.assign(detail, saved); fixture.data.device.items[0].name = saved.name; }
      if (route.request().method() === 'DELETE') fixture.data.device.items = [];
      return route.fulfill({ json: { code: 0, data: detail } });
    });
    // 摘要首次请求可能先于 fixture 更新，显式刷新后验证长 ID。
    await page.getByRole('button', { name: '刷新我的设备', exact: true }).click();
    await page.getByRole('button', { name: '查看设备0', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑设备' });
    await expect(editor.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备0');
    await expect(page).toHaveURL(/pages\/home\/index/);
    const output = path.join(__dirname, '../../artifacts/home-device'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `editor-${width}-${theme}.png`) });
    await editor.getByRole('textbox', { name: '名称', exact: true }).fill('设备已修改');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('button', { name: '查看设备已修改', exact: true })).toBeVisible();
    expect(saved.id).toBeUndefined(); expect(saved.remark).toBe(detail.remark); expect(saved.purchasePrice).toBeNull(); expect(saved.purchaseDate).toBeNull();
    await page.getByRole('button', { name: '查看设备已修改', exact: true }).click();
    await editor.getByRole('button', { name: '删除设备', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('[aria-label="我的设备首页卡片"]')).toContainText('暂无在用设备');
    await expect(page).toHaveURL(/pages\/home\/index/);
    expect(fixture.calls.some(path => path.startsWith('/device/query'))).toBe(false);
  });
}

test('首页设备详情失败可重试，关闭慢请求不重开弹窗', async ({ page }) => {
  await setup(page, { count: 1 });
  let failed = true, release;
  await page.route('**/api/device/device-0', async route => {
    if (release === null) await new Promise(resolve => { release = resolve; });
    return route.fulfill({ json: failed ? { code: 1, message: '模拟加载失败' } : { code: 0, data: { id: 'device-0', name: '设备完整名称' } } });
  });
  await page.getByRole('button', { name: '查看设备0', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑设备' });
  await expect(editor.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  failed = false;
  await editor.getByRole('button', { name: '重试', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备完整名称');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  release = null;
  await page.getByRole('button', { name: '查看设备0', exact: true }).click();
  await expect.poll(() => typeof release).toBe('function');
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  release();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/pages\/home\/index/);
});

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) for (const kind of ['income', 'expense']) test(`${kind} 日历明细页触底分页、失败重试及返回原卡片 ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 700 });
  await page.addInitScript(theme => localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme })), theme);
  await setup(page); const title = kind === 'income' ? '收入' : '支出';
  const card = page.locator('[aria-label="' + title + '首页卡片"]');
  await expect(card).toHaveAttribute('aria-busy', 'false');
  const calls = []; let fail = true;
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [{ id: '1', dictLabel: '模拟分类' }] } } }));
  await page.route('**/api/' + kind + '/query?*', route => {
    const params = new URL(route.request().url()).searchParams, number = Number(params.get('page')); calls.push(Object.fromEntries(params));
    return route.fulfill({ json: number === 2 && fail ? { code: 1, message: '模拟明细失败' } : { code: 0, data: { items: Array.from({ length: number === 1 ? 20 : 1 }, (_, index) => ({ id: String((number - 1) * 20 + index + 1), amt: 128.8, remark: '明细' + ((number - 1) * 20 + index + 1) + '：很长的收支描述需要正常换行而且不能撑宽页面', incDate: '2026-10-01', expTime: '2026-10-01 10:00:00', incTypeId: '1', expTypeId: '1' })), total: 21 } } });
  });
  await card.locator('.calendar-cell').first().scrollIntoViewIfNeeded();
  const before = await card.boundingBox(); await card.locator('.calendar-cell').first().click();
  const dialog = page.getByRole('region', { name: title + '明细' }); await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/pages\/finance\/calendar-details\?/);
  await expect(dialog).toContainText('明细20'); await expect(dialog).toContainText('模拟分类');
  await expect(page.getByRole('dialog', { name: title + '明细' })).toHaveCount(0);
  const back = dialog.getByRole('button', { name: '返回', exact: true });
  await expect(back).toBeInViewport();
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  await page.screenshot({ path: info.outputPath('calendar-details-long-list.png') });
  expect(calls[0].endTimeBefore).toBeTruthy(); expect(calls[0].startTime.includes(' ')).toBe(kind === 'expense');
  await dialog.locator('.details-row').first().hover();
  await page.mouse.wheel(0, 10000);
  await expect(dialog).toContainText('模拟明细失败'); fail = false;
  await dialog.getByRole('button', { name: '重试加载', exact: true }).click(); await expect(dialog).toContainText('明细21');
  expect(calls.map(row => row.page)).toEqual(['1', '2', '2']);
  await expect(back).toBeInViewport();
  await dialog.getByRole('button', { name: '返回', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/pages\/home\/index/);
  await expect(card).toBeVisible();
  expect((await card.boundingBox()).height).toBe(before.height);
  await expect.poll(async () => Math.abs((await card.boundingBox()).y - before.y)).toBeLessThanOrEqual(2);
});

test('收支日历范围独立持久化，切换 loading 保留高度，月年大金额完整展示', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 900 }); await setup(page);
  const income = page.locator('[aria-label="收入首页卡片"]'), expense = page.locator('[aria-label="支出首页卡片"]');
  await expect(income).toHaveAttribute('aria-busy', 'false'); const before = await income.boundingBox();
  await page.route('**/api/home/sections/income/calendar?*', async route => {
    const data = calendarFixture(new URL(route.request().url()), 'income'); data.buckets[0].amount = 99999999.99;
    await new Promise(resolve => setTimeout(resolve, 400)); return route.fulfill({ json: { code: 0, data } });
  });
  await income.getByRole('button', { name: '收入：月', exact: true }).click();
  await expect(income.getByRole('status', { name: '正在加载收入', exact: true })).toBeVisible();
  expect((await income.boundingBox()).height).toBe(before.height);
  await expect(income.getByRole('button', { name: '收入：月', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(income).toContainText('99,999,999.99'); await expect(expense.getByRole('button', { name: '支出：日', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await income.locator('.calendar-amount').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
  await income.screenshot({ path: info.outputPath('income-month-large.png') });
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('granularity')).map(key => [key, localStorage.getItem(key)]))).toEqual(expect.arrayContaining([['aio-life-mobile:home:income:granularity:fixture-user', expect.stringContaining('month')]]));
  await page.reload(); await expect(income.getByRole('button', { name: '收入：月', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(income.locator('.calendar-total')).toHaveText('12,345.67');
  await income.getByRole('button', { name: '收入：年', exact: true }).click(); await expect(income.getByRole('button', { name: '收入：年', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(income.locator('.calendar-date-controls')).toHaveCount(0);
  expect((await income.locator('.calendar-year-row').first().boundingBox()).height).toBe(40);
  await income.screenshot({ path: info.outputPath('income-year-large.png') });
});

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`锁定卡片原地解锁、取消与错误恢复 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme })), theme);
    const fixture = await setup(page, { locked: true });
    const card = page.locator('[aria-label="收支概览首页卡片"]');
    const unlock = card.getByRole('button', { name: '解锁收支概览', exact: true });
    await expect(unlock).toBeVisible();
    await expect(unlock.locator('img')).toBeVisible();
    const box = await unlock.boundingBox(), area = await card.locator('.dashboard-section').boundingBox();
    expect(box.width).toBe(44); expect(box.height).toBe(44);
    expect(Math.abs(box.x + box.width / 2 - area.x - area.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y + box.height / 2 - area.y - area.height / 2)).toBeLessThanOrEqual(1);
    expect(fixture.calls).not.toContain('/home/sections/finance/calendar');
    const folder = path.resolve('artifacts/home-locked'); fs.mkdirSync(folder, { recursive: true });
    await card.screenshot({ path: path.join(folder, 'locked-' + width + '-' + theme + '.png') });
    const modal = page.getByRole('dialog', { name: '解锁菜单', exact: true });
    await unlock.click();
    await expect(modal).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(modal).toHaveCount(0);
    await expect(unlock).toBeVisible();
    await expect(page).toHaveURL(/pages\/home\/index/);
    expect(fixture.calls).not.toContain('/home/sections/finance/calendar');
    await unlock.click();
    await modal.locator('input').fill('9999');
    await modal.getByRole('button', { name: '确认密码', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('二级密码错误');
    expect(fixture.calls).not.toContain('/home/sections/finance/calendar');
    await modal.locator('input').fill('001234');
    await modal.getByRole('button', { name: '确认密码', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(card).toContainText('10,000.00');
    await expect(unlock).toHaveCount(0);
    await expect(page).toHaveURL(/pages\/home\/index/);
    await card.getByRole('button', { name: '查看收支概览', exact: true }).click();
    await expect(page).toHaveURL(/pages\/finance\/index/);
  });
}
