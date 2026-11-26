const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');
const { waitForMotion } = require('./support/motion');

test('阅读书架的六本预览、榜单标识、刷新保留和分组返回', async ({ page, apiMock }, info) => {
  // 虚构书目，覆盖单行、长书名、不同状态和仅部分作品上榜。
  const titles = ['远山手记', '河流与城市的漫长对话', '花园来信', '海边的观察者', '城市街巷观察笔记（增订本）',
    '林中散步', '四季餐桌', '星图', '远行', '回望群山', '冬日书简', '小城地图', '石桥', '慢慢走', '草木之间', '昨日来信'];
  const colors = ['#345878', '#914345', '#85642e', '#54635b', '#6d4b63', '#317879'];
  const books = titles.map((title, i) => ({
    id: String(i + 1), title, type: 1, status: i < 3 ? 'in_progress' : i < 13 ? 'completed' : 'not_started',
    finishDate: i >= 3 && i < 13 ? '2026-10-' + String(14 - i).padStart(2, '0') : null,
    rankings: [0, 1, 7, 14, 15].includes(i)
      ? [{ rankingListId: '12', name: '豆瓣读书Top250', rank: i === 1 ? null : 156 + i }]
      : [],
    coverImgUrl: '/mock-shelf/' + i + '.svg',
  }));
  let releaseCover;
  const pendingCover = new Promise(resolve => { releaseCover = resolve; });
  let coverAttempts = 0;
  await page.route('**/mock-shelf/*.svg', async route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').pop().split('.')[0]);
    if (index === 3 && ++coverAttempts === 1) {
      await pendingCover;
      return route.abort();
    }
    return route.fulfill({ contentType: 'image/svg+xml', body:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 72"><rect width="54" height="72" fill="' + colors[index % colors.length] +
      '"/><circle cx="40" cy="63" r="23" fill="#fff" opacity=".16"/><text x="6" y="17" fill="white" font-size="8">' +
      titles[index].slice(0, 5) + '</text></svg>' });
  });
  const ok = data => ({ json: { code: 0, message: null, data } });
  let release, pending = new Promise(resolve => { release = resolve; });
  let fail = false, empty = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'mock-reading'));
  apiMock({
    'GET /api/user/info': ok({ id: '1', nickname: '模拟读者' }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/creative-works/rankings': ok([{ id: '12', name: '豆瓣读书Top250' }]),
    'GET /api/read-record/page': async request => {
      await pending;
      if (fail) return { json: { code: 1, message: '模拟书架刷新失败' } };
      const query = new URL(request.url()).searchParams;
      const group = empty ? [] : books.filter(book => book.status === query.get('statuses'));
      return ok({ items: group.slice(0, Number(query.get('pageSize'))), total: group.length });
    },
  });
  try {
    await page.goto('/#/pages/records/library?kind=read');
    const shelf = page.getByRole('group', { name: '读过', exact: true });
    const covers = shelf.locator('.shelf-cover');
    await expect(covers).toHaveCount(6);
    await expect(shelf.getByRole('status', { name: '正在加载封面', exact: true })).toHaveCount(6);
    const before = await covers.first().boundingBox();
    release();
    await expect(shelf.locator('.shelf-count')).toHaveText('10本');
    await expect(page.locator('.shelf-title')).toHaveCount(12);
    expect((await covers.first().boundingBox()).y).toBeCloseTo(before.y, 0);
    await expect(page.locator('.shelf-rank-name')).toHaveText(Array(5).fill('豆瓣 Top250'));
    await expect(page.locator('.shelf-rank')).toHaveText(['No.156', 'No.163', 'No.170', 'No.171']);
    const unnumbered = page.getByRole('button', { name: '编辑《' + titles[1] + '》', exact: true });
    await expect(unnumbered.locator('.shelf-badge')).toHaveText('豆瓣 Top250');
    await expect(page.locator('.shelf-date')).toHaveCount(6);
    const firstCompleted = shelf.getByRole('button', { name: '编辑《' + titles[3] + '》', exact: true });
    const pendingImage = firstCompleted.getByRole('status', { name: '正在加载封面', exact: true });
    const sweep = pendingImage.locator('.skeleton-cover-shimmer');
    await expect(sweep).toHaveCSS('animation-name', /skeleton-cover-sweep/);
    const [leftOffset, rightOffset] = await sweep.evaluate(async element => {
      const [animation] = element.getAnimations();
      animation.pause();
      await animation.ready;
      const duration = Number(animation.effect.getComputedTiming().duration);
      const offsets = [0.35, 0.65].map(progress => {
        animation.currentTime = progress * duration;
        return element.getBoundingClientRect().left - element.parentElement.getBoundingClientRect().left;
      });
      animation.currentTime = duration / 2;
      return offsets;
    });
    expect(leftOffset).toBeLessThan(0);
    expect(rightOffset).toBeGreaterThan(0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('.library-page')).toHaveClass(theme === 'dark' ? /library-page-dark/ : /^(?!.*library-page-dark)/);
        await expect(pendingImage).toBeVisible();
        await page.screenshot({ path: info.outputPath('reading-' + width + '-' + theme + '.png') });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(pendingImage).toBeVisible();
    await expect(sweep).toHaveCSS('animation-name', 'none');
    const pendingBox = await firstCompleted.locator('.shelf-cover').boundingBox();
    releaseCover();
    const retry = firstCompleted.getByRole('button', { name: '重试封面', exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(pendingImage).toHaveCount(0);
    await expect(retry).toHaveCount(0);
    const loadedBox = await firstCompleted.locator('.shelf-cover').boundingBox();
    expect(loadedBox.width).toBe(pendingBox.width);
    expect(loadedBox.height).toBe(pendingBox.height);
    await page.setViewportSize({ width: 390, height: 500 });
    const navigation = page.locator('.page-navigation');
    const scrollArea = page.locator('.mobile-page-scroll');
    const scroller = scrollArea.locator('.uni-scroll-view[style]').first();
    const header = await navigation.boundingBox();
    expect((await scrollArea.boundingBox()).y).toBeCloseTo(header.y + header.height, 0);
    await page.mouse.move(190, 280);
    await page.mouse.wheel(0, 240);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect((await navigation.boundingBox()).y).toBeCloseTo(header.y, 0);
    await expect(page.getByRole('button', { name: '筛选阅读记录' })).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await shelf.getByRole('button', { name: '查看全部读过记录' }).click();
    await expect(page).toHaveURL(/shelf=completed/);
    await expect(page.locator('.shelf-book[role=button]:visible')).toHaveCount(10);
    await expect(shelf.getByText('No.163', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page).toHaveURL(/kind=read$/);
    await expect(shelf.locator('.shelf-title')).toHaveCount(6);
    await waitForMotion(page);
    pending = new Promise(resolve => { release = resolve; });
    await pullDown(page, '.mobile-page-scroll');
    await expect(page.locator('.page-state')).toHaveAttribute('aria-busy', 'true');
    await expect(shelf.locator('.shelf-title')).toHaveCount(6);
    fail = true;
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(shelf.locator('.shelf-title')).toHaveCount(6);
    fail = false; empty = true;
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByText('暂无记录', { exact: true })).toBeVisible();
    await expect(page.locator('.shelf-book')).toHaveCount(0);
  } finally { release(); releaseCover(); }
});
