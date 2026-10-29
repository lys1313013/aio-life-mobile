const { test, expect } = require('./support/test');
const ok = data => ({ json: { code: 0, data } });
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
const scenarios = [
  { name: '待办', route: 'tasks/todo', tabs: '.column-tab', rows: '.task-card', secondCount: 1,
    handlers: {
      'GET /api/taskColumn/query': ok({ items: [{ id: '11', title: '工作' }, { id: '12', title: '生活' }], total: 2 }),
      'GET /api/tasks': ok({ items: [{ id: '21', columnId: '11', content: '模拟工作清单', unCompletedCount: 0 }, { id: '22', columnId: '12', content: '模拟生活清单', unCompletedCount: 0 }], total: 2 }),
      'GET /api/taskDetails': ok([]),
    }, request: 'GET /api/taskColumn/query' },
  { name: 'MCP', route: 'mcp/index', tabs: '.group-tab', rows: '.tool-row', secondCount: 1,
    handlers: { 'GET /api/mcp/tools': ok([{ name: 'time_record_queryByDateRange', description: '模拟工具', inputSchema: { type: 'object', properties: {} } }, { name: 'goal_query', description: '模拟目标工具', inputSchema: { type: 'object', properties: {} } }]) }, request: 'GET /api/mcp/tools' },
  { name: '消息', route: 'messages/index', tabs: '.filter-tabs [role=tab]', rows: '.conversation', secondCount: 0,
    handlers: {
      'GET /api/message/list': ok([{ id: '31', senderId: '2', receiverId: '1', content: '模拟已读会话', isRead: true, createTime: '2026-10-01 12:00:00' }]),
      'GET /api/user/1/basic': ok({ id: '1', nickname: '模拟用户' }),
      'GET /api/user/2/basic': ok({ id: '2', nickname: '模拟好友' }),
    }, request: 'GET /api/message/list' },
  { name: '分类管理', route: 'records/categories', tabs: '.category-type-tab', rows: '.category-row', secondCount: 1,
    handlers: {
      'GET /api/userDictType/dictTypeEnum': ok([{ value: 'exercise_type', label: '运动分类' }, { value: 'time_type', label: '时迹分类' }]),
      'GET /api/userDictData/query': request => { const type = new URL(request.url()).searchParams.get('dictType'); return ok({ items: [{ id: type === 'exercise_type' ? '41' : '42', dictType: type, dictLabel: '模拟分类', dictValue: 'mock', isEnabled: 1, sortOrder: 0, color: '#3478f6' }], total: 1 }); },
    }, request: 'GET /api/userDictData/query' },
];
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) for (const scenario of scenarios) {
  test(`统一分类分页 ${scenario.name} ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'category-pager-fixture'));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let pending = gate(), delayed = true, fail = false, reads = 0;
    const handler = scenario.handlers[scenario.request];
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: [] }),
      'GET /api/auth/secondary-lock/menus': ok([]),
      ...scenario.handlers,
      [scenario.request]: async request => { reads++; if (delayed) await pending.promise; if (fail) return { json: { code: 1, message: '模拟加载失败' } }; return typeof handler === 'function' ? handler(request) : handler; },
    });
    await page.goto('/#/pages/' + scenario.route);
    const pager = page.locator('.category-pager'), active = page.locator('.category-pager-active');
    await expect(active.locator('.page-state-placeholder').first()).toBeVisible();
    if (['MCP', '消息'].includes(scenario.name)) expect(await active.locator(scenario.name === 'MCP' ? '.tool-skeleton' : '.conversation-skeleton').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.screenshot({ path: info.outputPath('loading.png') });
    delayed = false; pending.release();
    await expect(active.locator('.page-state-placeholder')).toHaveCount(0);
    await expect(active.locator(scenario.rows).first()).toBeVisible();
    await expect.poll(() => page.locator('.category-pager-page').evaluateAll(nodes => nodes.every((node, i) => node.inert === (i !== 0)))).toBe(true);
    const firstTab = page.locator(scenario.tabs).first();
    await firstTab.focus(); await firstTab.press('ArrowRight');
    await expect(page.locator(scenario.tabs).nth(1)).toBeFocused();
    await expect.poll(() => page.locator('.category-pager-page').evaluateAll(nodes => nodes.every((node, i) => node.inert === (i !== 1)))).toBe(true);
    await page.locator(scenario.tabs).nth(1).press('Home');
    await expect(firstTab).toBeFocused();
    const bounds = await pager.boundingBox();
    await expect.poll(async () => Math.abs((await active.boundingBox()).x - bounds.x)).toBeLessThan(1);
    expect(bounds.height).toBeGreaterThan(150);
    const x = bounds.x + bounds.width * .8, y = bounds.y + 40;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x - bounds.width * .65, y, { steps: 12 });
    const panes = page.locator('.category-pager-page');
    expect((await panes.nth(0).boundingBox()).x).toBeLessThan(bounds.x);
    expect((await panes.nth(1).boundingBox()).x).toBeLessThan(bounds.x + bounds.width);
    await page.screenshot({ path: info.outputPath('dragging.png') });
    await page.mouse.up();
    await expect(page.locator(scenario.tabs).nth(1)).toHaveAttribute(scenario.name === '消息' ? 'aria-selected' : 'aria-pressed', 'true');
    await expect(active.locator('.page-state-placeholder')).toHaveCount(0);
    await expect(active.locator(scenario.rows)).toHaveCount(scenario.secondCount);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => Math.abs((await active.boundingBox()).x - bounds.x)).toBeLessThan(1);
    const before = reads;
    await page.locator(scenario.tabs).first().click();
    await expect(active.locator(scenario.rows).first()).toBeVisible();
    await page.locator(scenario.tabs).nth(1).click();
    await expect(active.locator(scenario.rows)).toHaveCount(scenario.secondCount);
    expect(reads).toBe(before);
    await expect.poll(async () => Math.abs((await active.boundingBox()).x - bounds.x)).toBeLessThan(1);
    const oldHeight = (await active.boundingBox()).height;
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      pending = gate(); delayed = true; fail = true;
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step * 18 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => reads).toBeGreaterThan(before);
      await expect(active.locator('.page-state').first()).toHaveAttribute('aria-busy', 'true');
      await expect(active.locator('.page-state-placeholder')).toHaveCount(0);
      expect((await active.boundingBox()).height).toBeCloseTo(oldHeight, 0);
      delayed = false; pending.release();
      await expect(active.getByRole('alert')).toBeVisible();
      fail = false;
      await active.getByRole('button', { name: '重试', exact: true }).click();
      await expect(active.getByRole('alert')).toHaveCount(0);
      await expect(active.locator('.page-state').first()).toHaveAttribute('aria-busy', 'false');
    } finally { pending.release(); await touch.detach(); }
    if (scenario.name === '待办') {
      await active.locator('[aria-label="添加待办到模拟工作清单"] input').fill('保留输入草稿');
      await expect(active.locator('[aria-label="添加待办到模拟工作清单"] input')).toHaveValue('保留输入草稿');
      await active.getByRole('button', { name: '编辑清单：模拟工作清单', exact: true }).click();
    } else if (scenario.name === 'MCP') await active.locator('.tool-row').click();
    else if (scenario.name === '分类管理') await active.getByRole('button', { name: '编辑分类', exact: true }).click();
    if (scenario.name !== '消息') await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.category-pager-scroll .uni-scroll-view-scrollbar-hidden').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).scrollbarWidth === 'none'))).toBe(true);
    await page.screenshot({ path: info.outputPath('loaded.png') });
    expect(errors).toEqual([]);
  });
}
