const { test, expect } = require('./support/test');
const { homeCardFixture } = require('./home-card-fixture');
const { pullDown } = require('./gestures');
const covers = ['#deb241', '#eeeee8', '#6abecb'].map((color, i) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="84" height="128"><rect width="84" height="128" fill="${color}"/><text x="42" y="56" fill="#333" text-anchor="middle" font-size="12">BOOK ${i + 1}</text></svg>`));
const books = ['西西弗神话', '思考，快与慢', '动物农场'].map((title, i) => ({ bookId: String(i + 1), title, author: ['阿尔贝·加缪', '丹尼尔·卡尼曼', '乔治·奥威尔'][i], cover: covers[i], readUpdateTime: String(1791163200 - i * 86400), progress: [42, 68, 15][i], deepLink: 'https://weread.qq.com/web/reader/fixture-' + i }));
async function setup(page, { connected = true, locked = false, compare = false } = {}) {
  const visual = { menuId: 'weread-menu', path: '/record/weread', icon: 'svg:weread', iconColor: '#4489ce' };
  const memberVisual = { menuId: 'member-menu', path: '/membership', icon: 'lucide:crown' };
  const cards = homeCardFixture().map(card => ({ ...card, isEnabled: Number(card.cardKey === 'section.thoughts' || (compare && card.cardKey === 'section.membership')), sortOrder: card.cardKey === 'section.membership' ? 2 : 1 }));
  cards.push({ cardKey: 'section.weread', title: '微信读书', group: 'section', isEnabled: 1, sortOrder: 0, ...visual });
  cards.sort((a, b) => a.sortOrder - b.sortOrder);
  const fixtures = {
    '/home/cards': cards, '/user/info': { id: 'fixture-user', nickname: '测试用户' },
    '/menu/visuals': { menus: [visual, memberVisual], cards: { 'section.weread': visual, 'section.membership': memberVisual } },
    '/auth/secondary-lock/menus': locked ? ['weread-menu'] : [],
    '/menu/all': [{ path: '/record/weread', meta: { menuId: 'weread-menu' } }, { path: '/membership', meta: { menuId: 'member-menu' } }],
    '/membership/list': Array.from({ length: 4 }, (_, i) => ({ id: 'member-' + i, name: '模拟会员 ' + i, expiryDate: '2099-12-31', status: 'active', category: 'other', autoRenew: 0 })),
    '/quick-nav/candidates': [{ path: '/membership' }],
    '/dashboard/tasks': [], '/thought/dashboard': [{ id: 'thought-1', content: '后续卡片位置对照', createTime: '2026-10-05 10:00:00' }],
    '/weread/connection': { connected: false },
  };
  for (const [path, data] of Object.entries(fixtures)) {
    const respond = route => route.fulfill({ json: { code: 0, data } });
    await page.route('**/api' + path, respond); await page.route('**/api' + path + '?*', respond);
  }
  const state = { books, calls: 0, fail: false, moreFail: false, paginated: false, cursors: [], release: null, gate: null, connected, cards, writes: [] };
  await page.route('**/api/home/cards', route => route.fulfill({ json: { code: 0, data: state.cards } }));
  await page.route('**/api/home/cards/order', route => {
    const payload = route.request().postDataJSON(); state.writes.push(payload);
    state.cards = state.cards.map(card => card.group === payload.group ? { ...card, sortOrder: payload.keys.indexOf(card.cardKey) } : card)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return route.fulfill({ json: { code: 0, data: state.cards } });
  });
  state.delay = () => { state.gate = new Promise(resolve => { state.release = resolve; }); };
  state.delay();
  const recent = async route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('pageSize')).toBe('6');
    expect(params.has('size')).toBe(false);
    const cursor = params.get('cursor');
    const previousBooks = cursor ? [...state.books] : null;
    state.calls++; state.cursors.push(cursor); await state.gate;
    const start = cursor ? Number(cursor.split(':')[1]) : 0;
    const rows = state.paginated ? (previousBooks || state.books).slice(start, start + 6) : state.books;
    const nextCursor = state.paginated && start + 6 < state.books.length ? '200:' + (start + 6) : null;
    return route.fulfill({ json: state.fail || (cursor && state.moreFail) ? { code: 1, message: '模拟失败' } : { code: 0, data: { connected: state.connected, books: rows, nextCursor } } });
  };
  await page.route('**/api/weread/recent', recent);
  await page.route('**/api/weread/recent?*', recent);
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'weread-home-fixture' })));
  await page.goto('/#/pages/home/index');
  return state;
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`最近阅读卡片交互与布局 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, { compare: true }), card = page.getByLabel('微信读书首页卡片', { exact: true });
    await expect(card).toBeVisible(); await expect(card).toHaveAttribute('aria-busy', 'true');
    const geometry = () => page.evaluate(() => {
      const card = document.querySelector('[aria-label="微信读书首页卡片"]').getBoundingClientRect();
      const next = document.querySelector('#home-order-section\\.thoughts').getBoundingClientRect();
      return { height: card.height, nextTop: next.top };
    });
    const initial = await geometry(); await card.screenshot({ path: info.outputPath('loading.png') });
    state.fail = true; state.release(); await expect(card).toContainText('加载失败，点击空白处重试');
    expect(await geometry()).toEqual(initial);
    await card.screenshot({ path: info.outputPath('initial-error.png') });
    state.fail = false; state.delay(); await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toHaveAttribute('aria-busy', 'true'); expect(await geometry()).toEqual(initial);
    state.release(); await expect(card).toContainText('42%');
    const loaded = await geometry(); expect(loaded).toEqual(initial);
    const memberCard = page.getByLabel('会员首页卡片', { exact: true }); await expect(memberCard).toContainText('模拟会员');
    const peerHeight = await memberCard.evaluate(el => el.getBoundingClientRect().height);
    if (width >= 768) expect(loaded.height).toBe(peerHeight);
    expect(loaded.height).toBe(width >= 1024 ? 280 : width >= 768 ? 250 : 204);
    await expect(card).not.toContainText('阿尔贝·加缪');
    await expect(card.getByRole('progressbar')).toHaveCount(0);
    const metadata = await card.locator('.book-meta').first().evaluate(el => {
      const [progress, date] = el.children;
      return { sameColor: getComputedStyle(progress).color === getComputedStyle(date).color, sameLine: Math.abs(progress.getBoundingClientRect().y - date.getBoundingClientRect().y) < 1, progressLeft: progress.getBoundingClientRect().right <= date.getBoundingClientRect().left };
    });
    expect(metadata).toEqual({ sameColor: true, sameLine: true, progressLeft: true });
    // 不仅数据已渲染，首屏三本封面和书名都必须在可视区域内。
    const firstScreen = await card.evaluate(el => {
      const viewport = el.querySelector('.book-scroll').getBoundingClientRect();
      return [...el.querySelectorAll('.book-button')].slice(0, 3).map(book => {
        const bounds = book.getBoundingClientRect(), cover = book.querySelector('.book-cover').getBoundingClientRect();
        return bounds.left >= viewport.left && bounds.right <= viewport.right + 1 && cover.left >= bounds.left && cover.right <= bounds.right + 1;
      });
    });
    expect(firstScreen).toEqual([true, true, true]);
    await card.screenshot({ path: info.outputPath('loaded.png') });
    expect(await card.getByRole('button').count()).toBe(4);
    const popupTask = page.waitForEvent('popup');
    await card.getByRole('button', { name: '在微信读书打开：西西弗神话', exact: true }).click();
    const popup = await popupTask; await popup.close(); expect(state.calls).toBe(2);
    // 唤起失败后的网页入口必须占用独立触控区，不能覆盖阅读时间或改变正文宽度。
    const contentBefore = await card.locator('.book-content').first().boundingBox();
    await page.evaluate(() => Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' }));
    await card.getByRole('button', { name: '在微信读书打开：西西弗神话', exact: true }).click();
    const fallback = card.getByRole('button', { name: '网页版阅读', exact: true });
    await expect(fallback).toBeVisible();
    expect(await card.locator('.book-content').first().boundingBox()).toEqual(contentBefore);
    const fallbackBox = await fallback.boundingBox(), dateBox = await card.locator('.reading-date').first().boundingBox();
    expect(fallbackBox.width).toBeGreaterThanOrEqual(44);
    expect(fallbackBox.y + fallbackBox.height).toBeLessThanOrEqual(dateBox.y);
    await card.screenshot({ path: info.outputPath('web-fallback.png') });
    const fallbackPopupTask = page.waitForEvent('popup'); await fallback.click();
    const fallbackPopup = await fallbackPopupTask; await fallbackPopup.close(); expect(state.calls).toBe(2);
    await page.evaluate(() => delete navigator.userAgent);
    state.delay(); await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toHaveAttribute('aria-busy', 'true'); expect(await geometry()).toEqual(loaded);
    await expect(card).toContainText('42%'); state.release(); await expect(card).toHaveAttribute('aria-busy', 'false');
    state.fail = true; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('刷新失败'); expect(await geometry()).toEqual(loaded);
    state.fail = false; state.books = []; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('暂无最近阅读'); const empty = await geometry(); expect(empty).toEqual(loaded);
    await card.screenshot({ path: info.outputPath('empty.png') });
    state.delay(); await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toHaveAttribute('aria-busy', 'true'); expect(await geometry()).toEqual(empty);
    state.release(); await expect(card).toHaveAttribute('aria-busy', 'false');
    state.books = [books[0]]; await card.click({ position: { x: 4, y: 60 } });
    await expect(card).toContainText('42%'); const single = await geometry();
    expect(single.height).toBe(loaded.height);
    state.books = [{ ...books[0], title: '长书名用于检查手机平板桌面是否溢出以及书籍封面作者和阅读进度是否仍然清晰可见' }];
    await card.click({ position: { x: 4, y: 60 } }); await expect(card).toContainText('长书名'); expect(await geometry()).toEqual(single);
    await card.screenshot({ path: info.outputPath('long-title.png') });
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
  // 等待未绑定响应，避免把首页尚未挂载卡片误判为已完成隐藏。
  await expect.poll(() => state.calls).toBe(1);
  await expect(page.getByLabel('微信读书首页卡片', { exact: true })).toHaveCount(0);
  state.connected = true;
  await page.route('**/api/auth/secondary-lock/menus', route => route.fulfill({ json: { code: 0, data: ['weread-menu'] } }));
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

for (const width of [390, 820, 900, 1440]) for (const theme of ['light', 'dark']) {
  test(`最近阅读实际滚动分页与失败恢复 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    state.paginated = true;
    state.books = Array.from({ length: 14 }, (_, i) => ({ ...books[i % 3], bookId: String(i + 1), title: '模拟分页图书 ' + (i + 1) }));
    state.release();
    const card = page.getByLabel('微信读书首页卡片', { exact: true });
    await expect(card.locator('.book-row-wrap')).toHaveCount(6);
    const geometry = () => page.evaluate(() => ({
      height: document.querySelector('[aria-label="微信读书首页卡片"]').getBoundingClientRect().height,
      nextTop: document.querySelector('#home-order-section\\.thoughts').getBoundingClientRect().top,
    }));
    const initial = await geometry();
    const scroller = card.locator('.book-scroll .uni-scroll-view[style]').first();
    // uni-app H5 的触底事件有 200ms 节流，按真实手势间隔滚动。
    const scrollEnd = async () => { await page.waitForTimeout(220); await scroller.hover(); await page.mouse.wheel(4000, 0); };
    const axes = await scroller.evaluate(el => ({ horizontal: el.scrollWidth > el.clientWidth, vertical: el.scrollHeight > el.clientHeight }));
    expect(axes).toEqual({ horizontal: true, vertical: false });
    const nextColumnOffset = await card.evaluate(el => {
      const right = el.querySelector('.book-scroll').getBoundingClientRect().right;
      const next = [...el.querySelectorAll('.book-column')].find(column => column.getBoundingClientRect().right > right + 1);
      return next ? next.getBoundingClientRect().left - right : null;
    });
    expect(nextColumnOffset).not.toBeNull();
    expect(nextColumnOffset).toBeGreaterThanOrEqual(-1);
    await card.screenshot({ path: info.outputPath('pagination-initial.png') });
    const firstBook = card.locator('.book-button').first(), firstBox = await firstBook.boundingBox();
    await firstBook.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: firstBox.x + 100, clientY: firstBox.y + 20 }] });
    await scroller.evaluate(el => { el.scrollLeft = 60; });
    await page.waitForTimeout(450);
    await expect(page.locator('[data-card-key="section.weread"]')).not.toHaveClass(/home-sort-lifted/);
    await firstBook.dispatchEvent('touchend', { touches: [] });
    state.moreFail = true; await scrollEnd();
    await expect(card).toContainText('加载失败，点击重试');
    expect(state.cursors).toEqual([null, '200:6']);
    await expect(card.locator('.book-row-wrap')).toHaveCount(6); expect(await geometry()).toEqual(initial);
    await card.screenshot({ path: info.outputPath('pagination-error.png') });
    state.moreFail = false; await card.getByRole('button', { name: '重试加载', exact: true }).click();
    await expect(card.locator('.book-row-wrap')).toHaveCount(12);
    expect(state.cursors).toEqual([null, '200:6', '200:6']);
    await scrollEnd(); await expect(card.locator('.book-row-wrap')).toHaveCount(14);
    expect(await geometry()).toEqual(initial);
    await scrollEnd(); await page.waitForTimeout(150);
    expect(state.cursors).toEqual([null, '200:6', '200:6', '200:12']);
    await card.screenshot({ path: info.outputPath('pagination-loaded.png') });
    // 延迟分页期间刷新，旧批次不能追加到刷新后的列表。
    await card.click({ position: { x: 4, y: 20 } });
    await expect(card.locator('.book-row-wrap')).toHaveCount(6);
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBe(0);
    state.delay(); await scrollEnd(); await expect.poll(() => state.cursors.at(-1)).toBe('200:6');
    state.paginated = false; state.books = [books[0]];
    await card.click({ position: { x: 4, y: 20 } }); state.release();
    await expect(card.locator('.book-row-wrap')).toHaveCount(1);
    await expect(card).not.toContainText('模拟分页图书');
  });
}

// 只在测试中调整真实组件的高度 props，覆盖当前首页预设以外的高卡片；不添加生产测试入口。
async function setCardHeight(card, height) {
  await card.evaluate((element, height) => {
    let component = element.__vueParentComponent;
    while (component && component.type.__name !== 'WereadRecentCard') component = component.parent;
    if (!component) throw new Error('未找到微信读书卡片组件');
    // 首页加载完成会重传预设高度；测试内固定这两个输入，模拟高卡片宿主。
    for (const key of ['height', 'maxHeight']) {
      delete component.props[key];
      Object.defineProperty(component.props, key, { configurable: true, get: () => height, set: () => {} });
    }
    component.update();
  }, height);
  await expect.poll(() => card.evaluate(el => el.getBoundingClientRect().height)).toBe(height);
}

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`高卡片多排与横向分页 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1100 }); await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    state.paginated = true;
    state.books = Array.from({ length: 18 }, (_, i) => ({ ...books[i % 3], bookId: String(i + 1), title: '高卡片模拟图书 ' + (i + 1) }));
    const card = page.getByLabel('微信读书首页卡片', { exact: true });
    await expect(card).toBeVisible();
    await setCardHeight(card, 520);
    await card.screenshot({ path: info.outputPath('tall-loading.png') });
    state.release(); await expect(card.locator('.book-button').first()).toBeVisible();
    const scroller = card.locator('.book-scroll .uni-scroll-view[style]').first();
    // 6 本在三排卡片内不溢出时应自动补页，不能卡在不可滚动的首屏。
    await expect.poll(() => scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(card.locator('.book-column').first().locator('.book-button')).toHaveCount(3);
    const items = await card.locator('.book-button').evaluateAll(els => els.slice(0, 4).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom }; }));
    expect(items[0].x).toBe(items[1].x); expect(items[1].y).toBeGreaterThan(items[0].bottom);
    expect(items[3].x).toBeGreaterThan(items[0].x);
    expect(await card.locator('.book-column').first().evaluate(column => {
      const bounds = column.getBoundingClientRect();
      return [...column.querySelectorAll('.book-title')].every(title => {
        const rect = title.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right + 1;
      });
    })).toBe(true);
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(false);
    await card.screenshot({ path: info.outputPath('tall-loaded.png') });
    await scroller.hover(); await page.mouse.wheel(4000, 0);
    await expect.poll(() => state.cursors.length).toBeGreaterThan(1);
    await expect.poll(() => card.locator('.book-button').count()).toBeGreaterThan(6);
    await setCardHeight(card, 400);
    await expect(card.locator('.book-column').first().locator('.book-button')).toHaveCount(2);
    await card.screenshot({ path: info.outputPath('medium-loaded.png') });
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(false);
  });
}
