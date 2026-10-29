const { test, expect } = require('./support/test');

function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
const ok = data => ({ json: { code: 0, data } });

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`视频分页与加载稳定 ${width} ${colorScheme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'video-pager-fixture'));
    let pending = gate(), delayed = true, fail = false;
    const requests = [];
    const row = { id: '9223372036854775807', title: '模拟长标题课程：从设计原则到完整项目实践与复盘', status: 'in_progress', duration: 3600, watchedDuration: 1800, ownerName: '模拟讲师', coverState: 'NONE' };
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: ['admin'] }),
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/b-video/getStatusCount': async () => { if (delayed) await pending.promise; return ok({ in_progress: 8, completed: 1, not_started: 1, on_hold: 0 }); },
      'GET /api/b-video/statistics': async () => { if (delayed) await pending.promise; return ok({ studiedSeconds: 1800, unstudiedSeconds: 1800 }); },
      'GET /api/b-video/query': async request => {
        const status = new URL(request.url()).searchParams.get('status') || '';
        requests.push(status);
        if (delayed) await pending.promise;
        if (fail) return { json: { code: 1, message: '模拟视频加载失败' } };
        const items = status === 'on_hold' ? [] : status === 'in_progress' ? Array.from({ length: 8 }, (_, index) => ({ ...row, id: String(index + 1) })) : [{ ...row, status: status || 'in_progress' }];
        return ok({ items, total: items.length });
      },
    });
    await page.goto('/#/pages/records/video');
    const active = page.locator('.video-page-active');
    const summary = page.locator('.video-summary');
    const pager = page.locator('.video-pager');
    await expect(active.locator('.video-skeleton-body')).toHaveCount(6);
    const initialCard = await active.locator('.video-card').first().boundingBox();
    const initialSummary = await summary.boundingBox();
    const initialPager = await pager.boundingBox();
    await page.screenshot({ path: info.outputPath('loading.png') });
    delayed = false; pending.release();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(8);
    await expect(summary).toHaveAttribute('aria-busy', 'false');
    expect(Math.abs((await active.locator('.video-card').first().boundingBox()).height - initialCard.height)).toBeLessThanOrEqual(2);
    expect(Math.abs((await summary.boundingBox()).height - initialSummary.height)).toBeLessThanOrEqual(2);
    expect(Math.abs((await pager.boundingBox()).y - initialPager.y)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: info.outputPath('loaded.png') });
    const bounds = await pager.boundingBox();
    // 普通鼠标从卡片区域拖动；半途必须同时看到旧页与相邻页。
    const x = bounds.x + bounds.width * 0.8, y = bounds.y + 90;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x - bounds.width * 0.6, y, { steps: 10 });
    const panes = page.locator('.video-page-content');
    expect((await panes.nth(1).boundingBox()).x).toBeLessThan(bounds.x);
    expect((await panes.nth(2).boundingBox()).x).toBeLessThan(bounds.x + bounds.width);
    await page.screenshot({ path: info.outputPath('dragging.png') });
    await page.mouse.up();
    await expect(page.locator('.status-tab').nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(active.getByText('暂无记录', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.status-tab').nth(1).click();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(8);
    expect(requests.filter(value => value === 'in_progress')).toHaveLength(1);
    await expect.poll(async () => Math.abs((await panes.nth(1).boundingBox()).x - bounds.x)).toBeLessThan(1);
    // 触摸刷新保留卡片及统计，失败保留内容，再原位重试。
    const touch = await page.context().newCDPSession(page);
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    pending = gate(); delayed = true; fail = true;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step * 18 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(active.getByRole('status', { name: '正在更新内容' })).toBeVisible();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(8);
    expect((await active.locator('.video-card').first().boundingBox()).height).toBeCloseTo(initialCard.height, 0);
    delayed = false; pending.release();
    await expect(active.getByRole('alert')).toBeVisible();
    fail = false;
    await active.getByRole('button', { name: '重试', exact: true }).click();
    await expect(active.getByRole('alert')).toHaveCount(0);
    await expect(active.getByRole('status', { name: '正在更新内容' })).toHaveCount(0);
    await expect(active.locator('.video-skeleton-body')).toHaveCount(0);
    const scrollbars = await page.locator('.video-pager .category-pager-scroll .uni-scroll-view-scrollbar-hidden').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).scrollbarWidth));
    expect(scrollbars).toEqual(['none', 'none', 'none', 'none', 'none']);
    await page.screenshot({ path: info.outputPath('refreshed.png') });
    // 未访问状态首次失败可重试；切走不让旧状态覆盖当前页。
    fail = true;
    await page.locator('.status-tab').nth(0).click();
    await expect(active.getByRole('alert')).toBeVisible();
    fail = false;
    pending = gate(); delayed = true;
    await active.getByRole('button', { name: '重试', exact: true }).click();
    await expect(active.locator('.video-skeleton-body')).toHaveCount(6);
    await page.locator('.status-tab').nth(1).click();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(8);
    delayed = false; pending.release();
    await page.locator('.status-tab').nth(0).click();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(1);
    await page.locator('.status-tab').nth(4).click();
    await expect(active.getByRole('button', { name: /^编辑视频/ })).toHaveCount(1);
    await expect.poll(async () => Math.abs((await panes.nth(4).boundingBox()).x - bounds.x)).toBeLessThan(1);
    const beforeBoundary = requests.length;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 100, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.abs((await panes.nth(4).boundingBox()).x - bounds.x)).toBeLessThan(1);
    expect(requests).toHaveLength(beforeBoundary);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 30, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 150, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(async () => Math.abs((await panes.nth(4).boundingBox()).x - bounds.x)).toBeLessThan(1);
    await expect(page.locator('.status-tab').nth(4)).toHaveAttribute('aria-pressed', 'true');
    await touch.detach();

  });
}
