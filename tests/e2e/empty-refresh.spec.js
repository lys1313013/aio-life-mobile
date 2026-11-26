const { waitForMotion } = require('./support/motion');
const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
const ok = data => ({ json: { code: 0, message: null, data } });
const user = { id: 'empty-fixture-user', nickname: '模拟用户', roles: [] };
const common = () => ({
  'GET /api/auth/secondary-lock/menus': ok([]),
  'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
  'GET /api/user/info': ok(user),
});
async function prepare(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-empty-refresh' })));
}
const cases = [
  { route: 'finance/cards', empty: '暂无储蓄卡', path: '/api/bank-cards', data: [], extra: { 'GET /api/bank-cards/banks': ok([]), 'GET /api/bank-cards/tags': ok([]) } },
  { route: 'finance/expense', empty: '暂无记录', path: '/api/expense/query', data: { items: [], total: 0 }, extra: { 'GET /api/userDictType/getByDictType': ok({ dictDetailList: [] }), 'GET /api/expense/statisticsByMonth': ok([]) } },
  { route: 'mcp/index', empty: '暂无 MCP 工具', path: '/api/mcp/tools', data: [], scroller: '.category-pager-scroll' },
  { route: 'relationship/index', empty: '暂无人物', path: '/api/relationships/graph', data: { nodes: [], edges: [] }, extra: { 'POST /api/relationships/persons': ok(null) } },
];

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  for (const entry of cases) test(`空态刷新与失败重试保留高度 ${entry.route} ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await prepare(page, width, theme);
    let pending = null, fail = false;
    apiMock({
      ...common(), ...entry.extra,
      ['GET ' + entry.path]: async () => {
        const hold = pending;
        if (hold) await hold.promise;
        return fail ? { json: { code: 1, message: '模拟刷新失败' } } : ok(entry.data);
      },
    });
    try {
      await page.goto('/#/pages/' + entry.route);
      const empty = page.getByText(entry.empty, { exact: true });
      await expect(empty).toBeVisible();
      const graph = entry.route === 'relationship/index';
      const region = graph ? page.locator('.graph-state .page-state') : page.locator('.page-state').filter({ has: empty });
      const layout = graph ? page.locator('.graph-panel') : region;
      await expect(region).toHaveAttribute('aria-busy', 'false');
      const before = await layout.boundingBox();
      const emptyHeight = (await empty.boundingBox()).height;
      pending = gate();
      fail = true;
      if (graph) {
        await page.getByRole('button', { name: '新增人物', exact: true }).click();
        await expect(page).toHaveURL(/relationship\/person-edit$/);
        const form = page.getByRole('region', { name: '新增人物', exact: true });
        await form.getByRole('textbox', { name: '姓名', exact: true }).fill('模拟人物');
        await form.getByRole('button', { name: '保存', exact: true }).click();
        await expect(page).toHaveURL(/relationship\/index$/);
      } else {
        await pullDown(page, entry.scroller || '.mobile-page-scroll');
      }
      await expect(region).toHaveAttribute('aria-busy', 'true');
      await expect(empty).toBeVisible();
      expect((await layout.boundingBox()).height).toBe(before.height);
      expect((await empty.boundingBox()).height).toBe(emptyHeight);
      await page.screenshot({ path: info.outputPath('empty-refresh.png'), fullPage: true });
      pending.release();
      pending = null;
      await expect(region.getByRole('alert')).toBeVisible();
      await expect(empty).toBeVisible();
      expect((await layout.boundingBox()).height).toBe(before.height);
      pending = gate();
      fail = false;
      await region.getByRole('button', { name: '重试', exact: true }).click();
      await expect(region).toHaveAttribute('aria-busy', 'true');
      await expect(empty).toBeVisible();
      expect((await layout.boundingBox()).height).toBe(before.height);
      pending.release();
      pending = null;
      await expect(region).toHaveAttribute('aria-busy', 'false');
      await expect(region.getByRole('alert')).toHaveCount(0);
      expect((await layout.boundingBox()).height).toBe(before.height);
    } finally { pending?.release(); }
  });

  for (const kind of ['income', 'expense']) test(`财务冷启动用户资料等待有占位且不提前查询 ${kind} ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await prepare(page, width, theme);
    const profile = gate();
    const records = gate();
    const title = kind === 'expense' ? '支出' : '收入';
    const businessCalls = [];
    apiMock({
      ...common(),
      'GET /api/user/info': async () => { await profile.promise; return ok(user); },
      'GET /api/userDictType/getByDictType': request => { businessCalls.push(new URL(request.url()).pathname); return ok({ dictDetailList: [] }); },
      ['GET /api/' + kind + '/query']: async request => { businessCalls.push(new URL(request.url()).pathname); await records.promise; return ok({ items: [], total: 0 }); },
      ['GET /api/' + kind + '/statisticsByMonth']: async request => { businessCalls.push(new URL(request.url()).pathname); await records.promise; return ok([]); },
    });
    try {
      await page.goto('/#/pages/finance/' + kind);
      await expect(page.getByRole('status', { name: '正在加载' + title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '返回', exact: true })).toBeVisible();
      await expect(page.getByText('暂无记录', { exact: true })).toHaveCount(0);
      expect(businessCalls).toEqual([]);
      await waitForMotion(page);
      const filter = page.getByRole('button', { name: '筛选' + title, exact: true });
      await expect(filter).toHaveAttribute('disabled', 'true');
      const pending = page.locator('.ledger-pending');
      const layout = {
        toolbar: await page.locator('.pending-toolbar:visible').boundingBox(),
        overview: await pending.locator('.ledger-overview-skeleton').boundingBox(),
        footer: await pending.locator('.pending-footer').boundingBox(),
        list: await pending.locator(':scope > .content-skeleton').boundingBox(),
      };
      // 筛选入口位于标题栏，概览占位和列表操作区分开。
      expect(layout.overview.y).toBeGreaterThan(layout.toolbar.y + layout.toolbar.height);
      expect(layout.footer.y).toBeGreaterThan(layout.overview.y + layout.overview.height);
      expect(layout.list.y).toBeGreaterThan(layout.footer.y + layout.footer.height);
      await page.screenshot({ path: info.outputPath('initializing.png'), fullPage: true });
      profile.release();
      await expect.poll(() => businessCalls).toContain('/api/' + kind + '/query');
      await expect(page.getByRole('status', { name: '正在加载' + title, exact: true })).toHaveCount(0);
      const ledger = page.locator('.body.ui-page-body');
      await expect(ledger.locator(':scope > .page-state')).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByText('暂无记录', { exact: true })).toHaveCount(0);
      expect(await page.locator('.ledger-toolbar:visible').boundingBox()).toEqual(layout.toolbar);
      expect(await ledger.locator('.filter-footer').boundingBox()).toEqual(layout.footer);
      expect(await ledger.locator(':scope > .page-state').boundingBox()).toEqual(layout.list);
      expect(await ledger.locator('.ledger-overview-skeleton').boundingBox()).toEqual(layout.overview);
      await page.screenshot({ path: info.outputPath('business-loading.png'), fullPage: true });
      records.release();
      await expect(page.getByText('暂无记录', { exact: true })).toBeVisible();
      await expect(page.getByRole('status', { name: '正在加载' + title, exact: true })).toHaveCount(0);
      expect(businessCalls).toContain('/api/' + kind + '/query');
    } finally { profile.release(); records.release(); }
  });
}
