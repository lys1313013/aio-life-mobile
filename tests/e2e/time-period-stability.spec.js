const { test, expect } = require('./support/test');

const today = '2026-11-12';
const response = data => ({ json: { code: 0, message: null, data } });
const records = ['2026-11-10', '2026-11-11', today, '2026-11-13', '2026-11-14'].flatMap((date, index) => [
  { id: `92233720368547750${index}1`, date, categoryId: '1', startMinute: 0, endMinute: 479, title: `模拟休息 ${date}` },
  { id: `92233720368547750${index}2`, date, categoryId: '2', startMinute: 540, endMinute: 1079, title: `模拟工作 ${date}：整理项目资料与当天进展` },
]);

for (const view of ['时间轴视图', '卡片视图']) for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`时迹滑动落位保留目标内容且无错帧 ${view} ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date(today + 'T18:00:00'));
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(view => {
      localStorage.setItem('aio-life-mobile.access-token.v1', 'period-stability-fixture');
      localStorage.setItem('time-tracker-view-mode', view === '卡片视图' ? 'card' : 'timeline');
    }, view);
    apiMock({
      'GET /api/auth/secondary-lock/menus': response([]),
      'GET /api/timeTrackerCategory/list': response([
        { id: '1', name: '休息', color: '#faad14' }, { id: '2', name: '工作', color: '#1677ff' },
      ]),
      'GET /api/timeRecord/query': request => response(records.filter(record => record.date === new URL(request.url()).searchParams.get('date'))),
      'GET /api/timeRecord/queryByDateRange': request => {
        const query = new URL(request.url()).searchParams;
        return response(records.filter(record => record.date >= query.get('startDate') && record.date <= query.get('endDate')));
      },
    });
    await page.goto('/#/pages/time/index');
    await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const pager = page.locator('.time-period-pager');
    async function swipe(step, date) {
      await expect(pager).toHaveAttribute('data-phase', 'idle');
      const box = await pager.boundingBox();
      const x = box.x + box.width * (step > 0 ? 0.8 : 0.2), y = box.y + Math.min(200, box.height / 2);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 120, y }] });
      await expect(pager).toHaveAttribute('data-phase', 'dragging');
      const preview = page.locator('.time-period-preview').nth(step > 0 ? 1 : 0);
      await expect(preview.locator(`[aria-label="编辑记录 模拟工作 ${date}：整理项目资料与当天进展${view === '时间轴视图' ? '，09:00 - 17:59，9h' : ''}"]`)).toBeVisible();
      const pane = await preview.elementHandle();
      const content = await preview.locator(view === '时间轴视图' ? '.timeline-scroll' : '.record-list').elementHandle();
      await pager.evaluate((root, date) => {
        const frames = [];
        const sample = () => {
          if (document.querySelector('.date-value').textContent.trim() !== date) return;
          const viewport = root.getBoundingClientRect(), middle = viewport.x + viewport.width / 2;
          const pane = [...root.querySelectorAll('.time-period-pane')].find(el => {
            const rect = el.getBoundingClientRect(); return rect.x <= middle && rect.right > middle;
          });
          frames.push(pane ? [...pane.querySelectorAll('[aria-label^="编辑记录 "]')].map(el => el.getAttribute('aria-label')).join('|') : 'blank');
        };
        const observer = new MutationObserver(sample);
        observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
        let animation;
        const frame = () => { sample(); animation = requestAnimationFrame(frame); };
        animation = requestAnimationFrame(frame);
        root.finishFrameCapture = () => { sample(); observer.disconnect(); cancelAnimationFrame(animation); return frames; };
      }, date);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('.date-value')).toHaveText(date);
      await expect(pager).toHaveAttribute('data-phase', 'idle');
      await expect(page.locator('.time-main-panel')).toHaveAttribute('aria-busy', 'false');
      const frames = await pager.evaluate(root => root.finishFrameCapture());
      await test.info().attach(`settled-frames-${date}`, { body: Buffer.from(JSON.stringify(frames)), contentType: 'application/json' });
      expect.soft(await pane.evaluate(el => el.isConnected && !el.classList.contains('time-period-preview')), '滑入的预览页应直接成为当前页').toBe(true);
      expect.soft(await content.evaluate(el => el.isConnected), '内容及其滚动容器不能在落位时重建').toBe(true);
      expect.soft(frames.length, '必须采样到落位时的内容').toBeGreaterThan(0);
      expect.soft(frames.every(text => text.includes(`模拟工作 ${date}`)), '日期更新后不能短暂绘制空白或其他日期').toBe(true);
      const titles = page.locator(view === '时间轴视图' ? '.timeline .event-title' : '.record-card-title');
      await expect(titles).toHaveText([`模拟休息 ${date}`, `模拟工作 ${date}：整理项目资料与当天进展`]);
      await expect(titles.nth(0)).toBeVisible();
      await expect(titles.nth(1)).toBeVisible();
      await page.screenshot({ path: `artifacts/time-period-stability/${view}-${width}-${theme}-${date}.png` });
    }
    try {
      await swipe(1, '2026-11-13');
      await swipe(-1, today);
    } finally {
      await cdp.detach();
    }
  });
}
