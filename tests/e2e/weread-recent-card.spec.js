const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');
const { pullDown } = require('./gestures');
const covers = ['#deb241', '#eeeee8', '#6abecb'].map((color, i) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="84" height="128"><rect width="84" height="128" fill="${color}"/><text x="42" y="56" fill="#333" text-anchor="middle" font-size="12">BOOK ${i + 1}</text></svg>`));
const books = ['西西弗神话', '思考，快与慢', '动物农场'].map((title, i) => ({ bookId: String(i + 1), title, author: ['阿尔贝·加缪', '丹尼尔·卡尼曼', '乔治·奥威尔'][i], cover: covers[i], readUpdateTime: String(1791163200 - i * 86400), progress: [42, 68, 15][i], deepLink: 'https://weread.qq.com/web/reader/fixture-' + i }));
async function setup(page, { connected = true, locked = false } = {}) {
  const visual = { menuId: 'weread-menu', path: '/record/weread', icon: 'svg:weread', iconColor: '#4489ce' };
  const cards = homeCardFixture().map(card => ({ ...card, enabled: card.cardKey === 'section.thoughts', sortOrder: 1 }));
  cards.push({ cardKey: 'section.weread', title: '微信读书', group: 'section', enabled: true, sortOrder: 0, ...visual });
  cards.sort((a, b) => a.sortOrder - b.sortOrder);
  const fixtures = {
    '/home/cards': cards, '/user/info': { id: 'fixture-user', nickname: '测试用户' },
    '/menu/visuals': { menus: [visual], cards: { 'section.weread': visual } },
    '/auth/secondary-lock/menus': locked ? ['weread-menu'] : [],
    '/menu/all': [{ path: '/record/weread', meta: { menuId: 'weread-menu' } }],
    '/dashboard/tasks': [], '/thought/dashboard': [{ id: 'thought-1', content: '后续卡片位置对照', createTime: '2026-10-05 10:00:00' }],
    '/weread/connection': { connected: false },
  };
  for (const [path, data] of Object.entries(fixtures)) {
    const respond = route => route.fulfill({ json: { rscode: '0', data } });
    await page.route('**/api' + path, respond); await page.route('**/api' + path + '?*', respond);
  }
  const state = { books, calls: 0, fail: false, release: null, gate: null, connected, cards, writes: [] };
  await page.route('**/api/home/cards', route => route.fulfill({ json: { rscode: '0', data: state.cards } }));
  await page.route('**/api/home/cards/order', route => {
    const payload = route.request().postDataJSON(); state.writes.push(payload);
    state.cards = state.cards.map(card => card.group === payload.group ? { ...card, sortOrder: payload.keys.indexOf(card.cardKey) } : card)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return route.fulfill({ json: { rscode: '0', data: state.cards } });
  });
  state.delay = () => { state.gate = new Promise(resolve => { state.release = resolve; }); };
  state.delay();
  await page.route('**/api/weread/recent', async route => {
    state.calls++; await state.gate;
    return route.fulfill({ json: state.fail ? { rscode: '1', result: '模拟失败' } : { rscode: '0', data: { connected: state.connected, books: state.books } } });
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'weread-home-fixture' })));
  await page.goto('/#/pages/home/index');
  return state;
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`最近阅读卡片交互与布局 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page), card = page.getByLabel('微信读书首页卡片', { exact: true });
    await expect(card).toBeVisible(); await expect(card).toHaveAttribute('aria-busy', 'true');
    const geometry = () => page.evaluate(() => {
      const card = document.querySelector('[aria-label="微信读书首页卡片"]').getBoundingClientRect();
      const next = document.querySelector('#home-order-section\\.thoughts').getBoundingClientRect();
      return { height: card.height, nextTop: next.top };
    });
    const initial = await geometry(); await card.screenshot({ path: info.outputPath('loading.png') });
    state.release(); await expect(card).toContainText('42%');
    const loaded = await geometry(); expect(loaded).toEqual(initial);
    await card.screenshot({ path: info.outputPath('loaded.png') });
    expect(await card.getByRole('button').count()).toBe(4);
    const popupTask = page.waitForEvent('popup');
    await card.getByRole('button', { name: '在微信读书打开：西西弗神话', exact: true }).click();
    const popup = await popupTask; await popup.close(); expect(state.calls).toBe(1);
    // 唤起失败后的网页入口必须占用独立触控区，不能覆盖阅读时间或改变正文宽度。
    const contentBefore = await card.locator('.book-content').first().boundingBox();
    await page.evaluate(() => Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' }));
    await card.getByRole('button', { name: '在微信读书打开：西西弗神话', exact: true }).click();
    const fallback = card.getByRole('button', { name: '网页版阅读', exact: true });
    await expect(fallback).toBeVisible();
    expect(await card.locator('.book-content').first().boundingBox()).toEqual(contentBefore);
    const fallbackBox = await fallback.boundingBox(), dateBox = await card.locator('.reading-date').first().boundingBox();
    expect(fallbackBox.width).toBeGreaterThanOrEqual(44);
    expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(fallbackBox.x);
    await card.screenshot({ path: info.outputPath('web-fallback.png') });
    const fallbackPopupTask = page.waitForEvent('popup'); await fallback.click();
    const fallbackPopup = await fallbackPopupTask; await fallbackPopup.close(); expect(state.calls).toBe(1);
    await page.evaluate(() => delete navigator.userAgent);
    state.delay(); await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toHaveAttribute('aria-busy', 'true'); expect(await geometry()).toEqual(loaded);
    await expect(card).toContainText('42%'); state.release(); await expect(card).toHaveAttribute('aria-busy', 'false');
    state.fail = true; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('刷新失败'); expect(await geometry()).toEqual(loaded);
    state.fail = false; state.books = []; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('暂无最近阅读'); const empty = await geometry(); expect(empty).toEqual(loaded);
    state.delay(); await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toHaveAttribute('aria-busy', 'true'); expect(await geometry()).toEqual(empty);
    state.release(); await expect(card).toHaveAttribute('aria-busy', 'false');
    state.books = [books[0]]; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('42%'); const single = await geometry(); expect(single.height).toBeLessThan(loaded.height);
    state.books = [{ ...books[0], title: '长书名用于检查手机平板桌面是否溢出以及书籍封面作者和阅读进度是否仍然清晰可见' }];
    await card.click({ position: { x: 4, y: 60 } }); await expect(card).toContainText('长书名'); expect(await geometry()).toEqual(single);
    expect(await card.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    const beforePull = state.calls; await pullDown(page, '.dashboard-scroll');
    await expect.poll(() => state.calls).toBe(beforePull + 1); await expect(card).toHaveAttribute('aria-busy', 'false');
    const beforeTitle = state.calls;
    await card.getByRole('button', { name: '查看微信读书', exact: true }).click();
    await expect(page).toHaveURL(/pages\/records\/weread/); expect(state.calls).toBe(beforeTitle);
  });
}
test('未绑定隐藏卡片，菜单锁不请求微信读书', async ({ page }) => {
  const state = await setup(page, { connected: false }); state.release();
  await expect(page.getByLabel('微信读书首页卡片', { exact: true })).toHaveCount(0);
  state.connected = true;
  await page.route('**/api/auth/secondary-lock/menus', route => route.fulfill({ json: { rscode: '0', data: ['weread-menu'] } }));
  const previous = state.calls;
  await page.reload(); await expect(page.getByLabel('微信读书首页卡片', { exact: true })).toContainText('点击解锁');
  expect(state.calls).toBe(previous);
});

for (const width of [390, 820, 1440]) test(`微信读书书籍区域长按移动整卡并保留短按 ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1100 });
  const state = await setup(page); state.release();
  const source = page.locator('[data-card-key="section.weread"]'), target = page.locator('[data-card-key="section.thoughts"]');
  const book = source.getByRole('button', { name: '在微信读书打开：西西弗神话', exact: true });
  await expect(source).toContainText('42%');
  const popupTask = page.waitForEvent('popup'); await book.click(); const popup = await popupTask; await popup.close();
  expect(state.writes).toEqual([]);
  let popups = 0; page.on('popup', () => popups++);
  const visibleOrder = () => page.locator('.home-order-section:visible').evaluateAll(rows => rows.map(row => row.dataset.cardKey));
  for (const touch of [true, false]) {
    const a = await book.boundingBox(), b = await target.boundingBox();
    const start = { identifier: 1, clientX: a.x + a.width / 2, clientY: a.y + a.height / 2 };
    const end = { identifier: 1, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
    const before = state.calls, saves = state.writes.length;
    if (touch) await book.dispatchEvent('touchstart', { touches: [start] });
    else { await page.mouse.move(start.clientX, start.clientY); await page.mouse.down(); }
    await expect(source).toHaveClass(/home-sort-lifted/);
    if (touch) {
      await book.dispatchEvent('touchmove', { touches: [end] });
      await expect(target).toHaveClass(/home-sort-target/);
      await book.dispatchEvent('touchend', { touches: [], changedTouches: [end] });
      await book.dispatchEvent('click');
    } else { await page.mouse.move(end.clientX, end.clientY, { steps: 10 }); await page.mouse.up(); }
    await expect.poll(() => state.writes.length).toBe(saves + 1);
    await expect.poll(visibleOrder).toEqual(touch ? ['section.thoughts', 'section.weread'] : ['section.weread', 'section.thoughts']);
    expect(state.writes.at(-1).keys).toContain('section.weread');
    expect(state.calls).toBe(before); expect(popups).toBe(0);
    await page.reload(); await expect(source).toContainText('42%');
    expect(await visibleOrder()).toEqual(touch ? ['section.thoughts', 'section.weread'] : ['section.weread', 'section.thoughts']);
  }
});
