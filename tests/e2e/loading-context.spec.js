const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
const ok = data => ({ json: { code: 0, message: null, data } });
const category = { id: '1', name: '模拟学习', color: '#5b8ff9', isTrackTime: 1, isEnabled: 1 };
function common() {
  return {
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/user/info': ok({ id: 'fixture-user', nickname: '模拟用户', roles: [] }),
  };
}
async function prepare(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  // 固定起点后正常推进时间；swiper 动画使用 Date.now()，不能冻结时钟。
  await page.clock.install({ time: new Date('2026-10-29T04:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-loading-context' })));
}
async function timeContentGeometry(page) {
  return page.locator('.time-body').evaluate(body => {
    const origin = body.getBoundingClientRect();
    const box = selector => {
      const rect = body.querySelector(selector).getBoundingClientRect();
      return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
    };
    // 下拉刷新会平移整个滚动内容；检查内容内部几何，避免把原生手势动画当成 loading 跳动。
    return { panel: box('.time-main-panel'), empty: box(':scope > .state-card') };
  });
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`时迹已加载空态刷新保持布局 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await prepare(page, width, theme);
    let pending = null;
    apiMock({
      ...common(),
      'GET /api/timeTrackerCategory/list': ok([category]),
      'GET /api/timeRecord/query': async () => { const hold = pending; if (hold) await hold.promise; return ok([]); },
      'GET /api/timeRecord/queryByDateRange': ok([]),
    });
    try {
      await page.goto('/#/pages/time/index');
      await expect(page.getByText('这段时间还没有记录', { exact: true })).toBeVisible();
      await expect(page.locator('.time-statistics .content-skeleton')).toHaveCount(0);
      for (const label of ['时间轴视图', '卡片视图']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        const panel = page.locator('.time-main-panel');
        const empty = page.getByText('这段时间还没有记录', { exact: true });
        const before = await timeContentGeometry(page);
        pending = gate();
        await pullDown(page, '.tab-scroll');
        await expect(panel).toHaveAttribute('aria-busy', 'true');
        await expect(empty).toBeVisible();
        await expect(page.locator('.time-pending-stats')).toHaveCount(0);
        await expect(page.getByRole('status', { name: '正在加载时迹清单', exact: true })).toHaveCount(0);
        expect(await timeContentGeometry(page)).toEqual(before);
        await page.screenshot({ path: info.outputPath(label + '-empty-refresh.png'), fullPage: true });
        pending.release();
        pending = null;
        await expect(panel).toHaveAttribute('aria-busy', 'false');
        expect(await timeContentGeometry(page)).toEqual(before);
      }
    } finally { pending?.release(); }
  });

  test(`时间看板切换周期隔离旧统计和乱序响应 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await prepare(page, width, theme);
    let round = 0;
    const holds = [null, gate(), gate()];
    const calls = [];
    const records = [
      { id: '1', categoryId: '1', date: '2026-10-29', startTime: 540, endTime: 599 },
      { id: '2', categoryId: '1', date: '2026-11-02', startTime: 540, endTime: 659 },
      { id: '3', categoryId: '1', date: '2026-11-09', startTime: 540, endTime: 719 },
    ];
    apiMock({
      ...common(),
      'GET /api/timeTrackerCategory/all': ok([category]),
      'GET /api/timeRecord/queryByDateRange': async request => {
        const requestRound = round;
        const params = new URL(request.url()).searchParams;
        const start = params.get('startDate'), end = params.get('endDate');
        calls.push({ round: requestRound, start, end });
        if (holds[requestRound]) await holds[requestRound].promise;
        return ok(records.filter(row => row.date >= start && row.date <= end));
      },
    });
    try {
      await page.goto('/#/pages/time/dashboard');
      await expect(page.locator('.time-dashboard-value')).toHaveText('1h');
      await expect(page.locator('.time-statistics .content-skeleton')).toHaveCount(0);
      round = 1;
      await page.getByRole('button', { name: '下一时段', exact: true }).click();
      await expect.poll(() => calls.some(call => call.round === 1 && call.start === '2026-11-02')).toBe(true);
      await expect(page.locator('.time-dashboard-range').first()).toContainText('2026-11-02');
      await expect(page.locator('.time-dashboard-value')).toHaveCount(0);
      await expect(page.locator('.content-skeleton').first()).toBeVisible();
      await page.screenshot({ path: info.outputPath('new-period-loading.png'), fullPage: true });
      round = 2;
      await page.getByRole('button', { name: '下一时段', exact: true }).click();
      await expect.poll(() => calls.some(call => call.round === 2 && call.start === '2026-11-09')).toBe(true);
      holds[2].release();
      await expect(page.locator('.time-dashboard-value')).toHaveText('3h');
      const obsolete = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/timeRecord/queryByDateRange' && url.searchParams.get('startDate') === '2026-11-02' && url.searchParams.get('endDate') === '2026-11-08';
      });
      holds[1].release();
      await (await obsolete).finished();
      await expect(page.locator('.time-dashboard-value')).toHaveText('3h');
      await expect(page.locator('.time-dashboard-range').first()).toContainText('2026-11-09');
      await page.screenshot({ path: info.outputPath('latest-period-loaded.png'), fullPage: true });
    } finally { holds.forEach(hold => hold?.release()); }
  });

  test(`微信读书换书加载失败重试不提前显示空态 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await prepare(page, width, theme);
    const books = ['A', 'B'].map(id => ({ bookId: id, title: '模拟书籍 ' + id, author: '模拟作者' }));
    let pending = gate(), failed = true, queries = 0;
    apiMock({
      ...common(),
      'GET /api/weread/connection': ok({ connected: true }),
      'POST /api/weread/sync': ok({ shelf: { books }, notebooks: { books: books.map(book => ({ bookId: book.bookId, book, noteCount: 1 })) }, stats: { totalReadTime: 0, readTimes: {}, readLongest: [] } }),
      'GET /api/weread/progress': ok({ book: { bookId: 'A' } }),
      'GET /api/weread/notes': async request => {
        const id = new URL(request.url()).searchParams.get('bookId');
        expect(['A', 'B']).toContain(id);
        queries++;
        if (id === 'A') return ok({ marks: { chapters: [], updated: [{ bookmarkId: 'mark-a', markText: '模拟 A 书笔记' }] }, reviews: [] });
        const hold = pending;
        await hold.promise;
        return failed ? { json: { code: 1, message: '模拟 B 书加载失败', data: null } } : ok({ marks: { chapters: [], updated: [] }, reviews: [] });
      },
    });
    async function waitForTab(label) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => page.locator('.category-pager-active').evaluate(element => {
        const viewport = element.closest('.category-pager').getBoundingClientRect();
        return Math.abs(element.getBoundingClientRect().x - viewport.x);
      }), { message: '等待当前页签完成翻页后再操作内容' }).toBeLessThan(1);
    }
    async function selectBook(title) {
      await page.locator('uni-picker[aria-label="笔记本"]').click();
      await page.locator('.uni-picker-select:visible, .uni-picker-view-indicator:visible').first().waitFor();
      if (await page.locator('.uni-picker-select:visible').count()) {
        await page.locator('.uni-picker-select:visible .uni-picker-item').getByText(title, { exact: true }).click();
        await expect(page.locator('.uni-picker-select:visible')).toHaveCount(0);
        return;
      }
      const wheel = page.locator('.uni-picker-content:visible .uni-picker-view-group');
      await wheel.hover();
      await page.mouse.wheel(0, 34);
      const item = wheel.locator('.uni-picker-item').getByText(title, { exact: true });
      await expect.poll(() => item.evaluate(element => {
        const indicator = element.closest('uni-picker-view-column').querySelector('.uni-picker-view-indicator').getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.y + rect.height / 2 - indicator.y - indicator.height / 2) < 0.5;
      }), { message: '等待原生滚轮将目标书籍对齐选中行' }).toBe(true);
      await page.locator('.uni-picker-action-confirm:visible').click();
      await expect(page.locator('.uni-picker-content:visible')).toHaveCount(0);
    }
    try {
      await page.goto('/#/pages/records/weread');
      await page.getByRole('button', { name: '我的书架', exact: true }).click();
      await waitForTab('我的书架');
      await page.getByRole('button', { name: '书籍详情：模拟书籍 A', exact: true }).click();
      await page.getByRole('button', { name: '查看笔记', exact: true }).click();
      await waitForTab('阅读笔记');
      await expect(page.getByText('模拟 A 书笔记', { exact: true })).toBeVisible();
      await selectBook('模拟书籍 B');
      await expect.poll(() => queries).toBe(2);
      await expect(page.getByText('模拟 A 书笔记', { exact: true })).toHaveCount(0);
      await expect(page.getByText('暂无记录', { exact: true })).toHaveCount(0);
      await expect(page.locator('.content-skeleton')).toBeVisible();
      const notesRegion = page.locator('.page-state .page-state');
      const loadingHeight = (await notesRegion.boundingBox()).height;
      await page.screenshot({ path: info.outputPath('different-book-loading.png'), fullPage: true });
      pending.release();
      await expect(page.getByRole('alert')).toContainText('模拟 B 书加载失败');
      expect((await notesRegion.boundingBox()).height).toBe(loadingHeight);
      failed = false;
      pending = gate();
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await expect.poll(() => queries).toBe(3);
      await expect(page.getByText('暂无记录', { exact: true })).toHaveCount(0);
      pending.release();
      await expect(page.getByText('暂无记录', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('empty-book-loaded.png'), fullPage: true });
    } finally { pending.release(); }
  });
}
