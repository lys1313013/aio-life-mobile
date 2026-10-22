const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const keys = ['memo', 'finance', 'video', 'device', 'income', 'expense'];
const titles = ['最近笔记', '收支概览', '视频续看', '我的设备', '收入', '支出'];
const routes = ['/my-hub/memo', '/finance-management/dashboard', '/finance-management/income', '/finance-management/expense', '/my-hub/videoWatch', '/my-hub/device'];
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
    '/home/cards': keys.map((key, sortOrder) => ({ cardKey: 'section.' + key, title: titles[sortOrder], group: 'section', enabled, sortOrder })),
    '/menu/visuals': { menus: [], cards: {} }, '/user/info': { id: 'fixture-user', nickname: '测试用户' }, '/dashboard/tasks': [],
    '/auth/secondary-lock/menus': locked ? ['finance-expense'] : [],
    '/menu/all': routes.map((path, i) => ({ path, meta: { menuId: i === 3 ? 'finance-expense' : 'menu-' + i } })),
    '/quick-nav/candidates': routes.map(path => ({ path })),
  };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', ''); calls.push(path);
    if (path.startsWith('/file/preview/')) {
      imageHeaders.push(route.request().headers().authorization);
      const video = path.includes('video');
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="88"><rect width="144" height="88" fill="' + (video ? '#87a9c7' : '#a8b4a2') + '"/><rect x="30" y="18" width="84" height="52" rx="8" fill="#edf2f8"/><path d="M65 31L85 44L65 57Z" fill="#657d96"/></svg>' });
    }
    if (path.startsWith('/home/sections/')) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return route.fulfill({ json: failure ? { code: 1, message: '模拟摘要失败' } : { code: 0, data: data[path.split('/').pop()] } });
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
    const videoBefore = await page.locator('[aria-label="视频续看首页卡片"]').boundingBox();
    const deviceBefore = await page.locator('[aria-label="我的设备首页卡片"]').boundingBox();
    await page.screenshot({ path: info.outputPath('summary-loading.png'), fullPage: true });
    await expect(memo).toContainText('正文已隐藏');
    await expect(page.locator('[aria-label="收支概览首页卡片"]')).toContainText('¥10,000.00');
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
    for (const [title, before] of [['视频续看', videoBefore], ['我的设备', deviceBefore]]) expect(Math.abs((await page.locator('[aria-label="' + title + '首页卡片"]').boundingBox()).height - before.height)).toBeLessThanOrEqual(5);
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
  await expect(page.locator('[aria-label="收支概览首页卡片"]')).toContainText('点击解锁'); expect(locked.calls).not.toContain('/home/sections/finance');
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
test('设备卡片进入指定设备原编辑器；记一笔可选择支出与收入', async ({ page }) => {
  await setup(page, { count: 1 });
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
  await page.route('**/api/device/query?*', route => route.fulfill({ json: { code: 0, data: { items: [{ id: 'device-0', name: '设备完整名称', purchasePrice: 2460, purchaseDate: '2026-04-01', remark: '完整配置' }], total: 1 } } }));
  await page.getByRole('button', { name: '查看设备0', exact: true }).click();
  await expect(page).toHaveURL(/devices\?id=device-0/); const device = page.getByRole('dialog', { name: '编辑设备' }); await expect(device).toBeVisible(); await expect(device.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('设备完整名称');
  await device.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click();
  for (const kind of ['expense', 'income']) {
    await page.route('**/api/' + kind + '/query?*', route => route.fulfill({ json: { code: 0, data: { items: [], total: 0 } } }));
    await page.getByRole('button', { name: '记一笔', exact: true }).click(); await page.getByText(kind === 'expense' ? '记支出' : '记收入', { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(kind + '\\?create=1')); await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '返回', exact: true }).click();
  }
});
test('视频卡片续看打开对应集数且编辑进入完整原表单', async ({ page, context }) => {
  await setup(page, { count: 1 });
  await context.route('https://www.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>模拟视频页面</p>' }));
  const popup = context.waitForEvent('page'); await page.getByRole('button', { name: '继续观看视频0', exact: true }).click(); const video = await popup; await video.waitForLoadState(); expect(video.url()).toContain('BV1234567890?p=3'); await video.close();
  await page.route('**/api/b-video/query?*', route => route.fulfill({ json: { code: 0, data: { items: [{ id: 'video-0', title: '完整视频标题', currentEpisode: 3, episodes: 10, status: 'in_progress', duration: 100, watchedDuration: 25 }], total: 1 } } }));
  await page.getByRole('button', { name: '编辑视频0', exact: true }).click(); await expect(page).toHaveURL(/video\?id=video-0/); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog').getByRole('textbox', { name: '标题', exact: true })).toHaveValue('完整视频标题');
});
test('三财务卡范围切换独立，慢请求与失败保留对应标签和金额', async ({ page }) => {
  const fixture = await setup(page); const finance = page.locator('[aria-label="收支概览首页卡片"]');
  await expect(finance).toContainText('¥10,000.00'); const others = fixture.calls.filter(item => item.startsWith('/home/sections/') && !item.endsWith('/finance')).length;
  let releaseYear; const pendingYear = new Promise(resolve => { releaseYear = resolve; }); let yearFails = false;
  await page.route('**/api/home/sections/finance?*', async route => {
    const period = new URL(route.request().url()).searchParams.get('period');
    if (period === 'year' && !yearFails) await pendingYear;
    return route.fulfill({ json: yearFails && period === 'year' ? { code: 1, message: '本年请求失败' } : { code: 0, data: { period, label: period === 'all' ? '全部' : '2026年', income: 90000, expense: 10000, balance: period === 'all' ? 80000 : 50000, refreshInterval: 300 } } });
  });
  await finance.getByRole('button', { name: '收支概览：本年', exact: true }).click();
  await expect(finance.getByRole('button', { name: '收支概览：本年', exact: true })).toHaveAttribute('aria-busy', 'true');
  await expect(finance).toContainText('2026年10月'); await expect(finance).toContainText('¥10,000.00'); await expect(finance.getByRole('button', { name: '收支概览：本月', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await finance.getByRole('button', { name: '收支概览：全部', exact: true }).click(); await expect(finance).toContainText('¥80,000.00'); releaseYear(); await page.waitForTimeout(100); await expect(finance).not.toContainText('¥50,000.00');
  yearFails = true; await finance.getByRole('button', { name: '收支概览：本年', exact: true }).click(); await expect(finance.getByRole('button', { name: /重试收支概览：本年请求失败/ })).toBeVisible(); await expect(finance.getByRole('button', { name: '收支概览：全部', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(finance).toContainText('¥80,000.00');
  expect(fixture.calls.filter(item => item.startsWith('/home/sections/') && !item.endsWith('/finance')).length).toBe(others);
  for (const [kind, title] of [['income', '收入'], ['expense', '支出']]) {
    await page.route('**/api/home/sections/' + kind + '?*', route => route.fulfill({ json: { code: 0, data: { period: 'year', label: '2026年', amount: 98765.43, refreshInterval: 300 } } }));
    const card = page.locator('[aria-label="' + title + '首页卡片"]'); await card.getByRole('button', { name: title + '：本年', exact: true }).click(); await expect(card).toContainText('2026年'); await expect(card).toContainText('¥98,765.43');
  }
});
test('授权图片失败与无图保持固定占位，重试真正显示图片', async ({ page }) => {
  const fixture = await setup(page, { count: 3 }); const card = page.locator('[aria-label="我的设备首页卡片"]');
  await expect(card.locator('.summary-cover-image img')).toHaveCount(3); const before = await card.locator('.summary-image').first().boundingBox(); let fail = true;
  await page.route('**/api/file/preview/device-photo-fail', route => fail ? route.fulfill({ status: 503, body: 'failed' }) : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="green"/></svg>' }));
  fixture.data.device.items[0].fileId = 'device-photo-fail'; fixture.data.device.items[1].fileId = null;
  await card.getByRole('button', { name: '刷新我的设备', exact: true }).click(); await expect(card.getByRole('button', { name: '重试设备0图片', exact: true })).toBeVisible();
  const failed = await card.locator('.summary-image').first().boundingBox(); expect(failed.width).toBe(before.width); expect(failed.height).toBe(before.height); expect(await card.locator('.summary-image').nth(1).locator('img').count()).toBe(0);
  fail = false; await card.getByRole('button', { name: '重试设备0图片', exact: true }).click(); await expect.poll(() => card.locator('.summary-image').first().locator('img').evaluateAll(nodes => nodes.length === 1 && nodes[0].naturalWidth > 0)).toBe(true);
});
test('独立收入卡不依赖支出权限，收入与支出新增直达各自表单', async ({ page }) => {
  await setup(page, { locked: true }); await expect(page.locator('[aria-label="收入首页卡片"]')).toContainText('¥12,345.67'); await expect(page.locator('[aria-label="支出首页卡片"]')).toContainText('点击解锁');
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
  await page.route('**/api/income/query?*', route => route.fulfill({ json: { code: 0, data: { items: [], total: 0 } } }));
  await page.locator('[aria-label="收入首页卡片"]').getByRole('button', { name: '记收入', exact: true }).click(); await expect(page).toHaveURL(/income\?create=1/); await expect(page.getByRole('dialog')).toBeVisible();
});
