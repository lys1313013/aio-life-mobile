const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');

const day = '2026-11-12';
const response = data => ({ json: { code: 0, message: null, data } });
const records = [
  { id: '9223372036854775807', date: day, categoryId: '1', startMinute: 0, endMinute: 479, title: '休息' },
  { id: '9223372036854775806', date: day, categoryId: '2', startMinute: 540, endMinute: 719, title: '模拟长标题：整理项目资料并记录当天工作进展' },
  { id: '9223372036854775805', date: day, categoryId: '2', startMinute: 840, endMinute: 1079, title: '工作' },
];
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`时迹时间轴局部加载与高度稳定 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date(day + 'T18:00:00'));
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'period-loading-fixture'));
    const initial = gate(), next = gate(), comparison = gate();
    let refresh = gate();
    let refreshing = false, failed = false, nextRecords = [];
    apiMock({
      'GET /api/auth/secondary-lock/menus': response([]),
      'GET /api/timeTrackerCategory/list': response([
        { id: '1', name: '休息', color: '#faad14' }, { id: '2', name: '工作', color: '#1677ff' },
      ]),
      'GET /api/timeRecord/query': async request => {
        const date = new URL(request.url()).searchParams.get('date');
        if (date === '2026-11-10') await comparison.promise;
        if (date === day) { await initial.promise; return response(records); }
        if (date === '2026-11-13') {
          await next.promise;
          if (refreshing) await refresh.promise;
          return failed ? { json: { code: 1, message: '模拟时迹加载失败' } } : response(nextRecords);
        }
        return response([]);
      },
      'GET /api/timeRecord/queryByDateRange': request => {
        const query = new URL(request.url()).searchParams;
        return response([...records, ...nextRecords].filter(record => record.date >= query.get('startDate') && record.date <= query.get('endDate')));
      },
    });
    const timeline = page.locator('.timeline');
    const loader = timeline.getByRole('status', { name: '正在加载时迹', exact: true });
    const geometry = () => timeline.evaluate(el => { const r = el.getBoundingClientRect(); // 下拉刷新会平移整个原生滚动内容；比较内容内部的位置与高度。
      const content = el.closest('.uni-scroll-view-content');
      return { top: r.top - content.getBoundingClientRect().top, height: r.height }; });
    const snapshot = async name => {
      await page.screenshot({ path: `artifacts/time-period-loading/${width}-${theme}-${name}.png` });
    };
    try {
      await page.goto('/#/pages/time/index');
      await expect(loader).toBeVisible();
      await expect.poll(async () => (await timeline.boundingBox()).height).toBeGreaterThan(300);
      const initialBox = await geometry();
      await snapshot('initial');
      initial.release();
      await expect(timeline.locator('.timeline-event')).toHaveCount(3);
      await expect(loader).toHaveCount(0);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('content');

      // 缓存空态也是已加载；等待上一周期比较数据时静默查询。
      await page.getByRole('button', { name: '前一天', exact: true }).click();
      await expect(page.locator('.date-value')).toHaveText('2026-11-11');
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'true');
      await expect(loader).toHaveCount(0);
      await expect(timeline.locator('.timeline-event')).toHaveCount(0);
      await expect(page.locator('.time-pending-stats')).toHaveCount(0);
      await expect(page.getByText('这段时间还没有记录', { exact: true })).toBeVisible();
      await snapshot('cached-empty-silent');
      comparison.release();
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
      await page.getByRole('button', { name: '后一天', exact: true }).click();
      await expect(page.locator('.date-value')).toHaveText(day);
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
      await expect(timeline.locator('.timeline-event')).toHaveCount(3);

      // 相邻周期预取仍被 gate 按住；翻页落位后只在时间轴内部加载。
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      const box = await timeline.boundingBox();
      const x = box.x + box.width * 0.8, y = box.y + 200;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 120, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('.date-value')).toHaveText('2026-11-13');
      await expect(page.locator('.time-period-pager')).toHaveAttribute('data-phase', 'idle');
      await expect(loader).toBeVisible();
      await expect(page.locator('.time-main-panel > .loading-indicator')).toHaveCount(0);
      const track = await timeline.locator('.day-track').boundingBox();
      const ring = await loader.boundingBox();
      expect(Math.abs(ring.x + ring.width / 2 - track.x - track.width / 2)).toBeLessThan(2);
      expect(Math.abs(ring.y + ring.height / 2 - track.y - track.height / 2)).toBeLessThan(2);
      await snapshot('next-loading');
      next.release();
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
      await expect(timeline.locator('.timeline-event')).toHaveCount(0);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('empty');

      refreshing = true;
      await pullDown(page, '.tab-scroll');
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'true');
      await expect(loader).toHaveCount(0);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('refresh-empty');
      nextRecords = [{ ...records[1], date: '2026-11-13' }];
      refresh.release();
      await expect(loader).toHaveCount(0);
      await expect(timeline.locator('.timeline-event')).toHaveCount(1);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('single');

      failed = true;
      refresh = gate();
      await pullDown(page, '.tab-scroll');
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'true');
      await expect(loader).toHaveCount(0);
      await expect(timeline.locator('.timeline-event')).toHaveCount(1);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('refresh-content');
      refresh.release();
      await expect(page.getByRole('alert')).toContainText('模拟时迹加载失败');
      await expect(timeline.locator('.timeline-event')).toHaveCount(1);
      await expect(loader).toHaveCount(0);
      failed = false;
      await page.getByRole('button', { name: '重试时迹记录', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
      await expect(timeline.locator('.timeline-event')).toHaveCount(1);
      await expect.poll(geometry).toEqual(initialBox);
      await snapshot('retry');
      await cdp.detach();
    } finally {
      initial.release(); next.release(); refresh.release(); comparison.release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
