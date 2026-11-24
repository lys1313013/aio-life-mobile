const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');

const ok = data => ({ json: { code: 0, message: null, data } });
const unavailable = { json: { code: 1, message: '模拟榜单暂不可用' } };

async function openLibrary(page, apiMock, kind, rankings) {
  let listCalls = 0;
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'library-fixture'));
  apiMock({
    'GET /api/user/info': ok({ id: '1', nickname: '模拟用户' }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    ['GET /api/' + (kind === 'read' ? 'read-record' : 'movie') + '/page']: () => {
      listCalls++;
      return ok({ items: [{ id: '1', title: '模拟作品', type: 1, status: 'in_progress' }], total: 1 });
    },
    'GET /api/creative-works/rankings': request => {
      expect(new URL(request.url()).searchParams.get('media')).toBe(kind === 'read' ? 'book' : 'movie');
      return rankings();
    },
  });
  await page.goto('/#/pages/records/library?kind=' + kind);
  await expect(page.locator('.library-card')).toHaveCount(1);
  return () => listCalls;
}

test('观影榜单请求中断后返回补取，局部重试保留记录', async ({ page, apiMock }) => {
  let calls = 0, release;
  const slow = new Promise(resolve => { release = resolve; });
  try {
    const listCalls = await openLibrary(page, apiMock, 'movie', async () => {
      const attempt = ++calls;
      if (attempt === 1) { await slow; return ok([]); }
      return attempt === 2 ? unavailable : ok([{ id: '12', name: '模拟榜单' }]);
    });
    await expect(page.getByRole('button', { name: '加载榜单' })).toBeDisabled();
    await page.evaluate(() => {
      for (const value of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
    const retry = page.getByRole('button', { name: '重试榜单' });
    await expect(retry).toBeVisible();
    const before = listCalls();
    await retry.click();
    const filter = page.locator('uni-picker[aria-label="榜单"]');
    await expect(filter).toBeVisible();
    const oldResponse = page.waitForResponse(response => response.url().includes('/creative-works/rankings'));
    release();
    await (await oldResponse).finished();
    await expect(filter).toBeVisible();
    expect(calls).toBe(3);
    expect(listCalls()).toBe(before);
  } finally { release(); }
});

test('阅读下拉复用在途榜单请求，失败可补取，成功空榜单不重复查询', async ({ page, apiMock }) => {
  let release, calls = 0;
  const slow = new Promise(resolve => { release = resolve; });
  try {
    const listCalls = await openLibrary(page, apiMock, 'read', async () => {
      if (++calls === 1) { await slow; return unavailable; }
      return ok([]);
    });
    const refresh = async () => {
      const before = listCalls();
      await pullDown(page, '.mobile-page-scroll');
      await expect.poll(listCalls).toBe(before + 1);
    };
    await expect(page.getByRole('button', { name: '加载榜单' })).toBeDisabled();
    await refresh();
    expect(calls).toBe(1);
    release();
    const retry = page.getByRole('button', { name: '重试榜单' });
    await expect(retry).toBeVisible();
    await refresh();
    await expect(retry).toHaveCount(0);
    await expect(page.locator('uni-picker[aria-label="榜单"]')).toHaveCount(0);
    await refresh();
    expect(calls).toBe(2);
  } finally { release(); }
});

test('榜单接口短暂返回 503 后自动恢复，保留正在输入的搜索词', async ({ page, apiMock }) => {
  let calls = 0, release;
  const recovered = new Promise(resolve => { release = resolve; });
  try {
    const listCalls = await openLibrary(page, apiMock, 'read', async () => {
      if (++calls === 1) return { status: 503, body: '' };
      await recovered;
      return ok([{ id: '12', name: '模拟读书榜单' }]);
    });
    await page.getByRole('button', { name: '展开搜索', exact: true }).click();
    const search = page.locator('[aria-label="搜索阅读记录"] input');
    await search.fill('未提交的搜索词');
    await expect.poll(() => calls).toBe(2);
    release();
    await expect(page.locator('uni-picker[aria-label="榜单"]')).toBeVisible();
    await expect(search).toHaveValue('未提交的搜索词');
    expect(listCalls()).toBe(1);
  } finally { release(); }
});
