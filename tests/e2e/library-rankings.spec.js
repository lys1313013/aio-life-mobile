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
    ['GET /api/' + (kind === 'read' ? 'read-record' : 'movie') + '/page']: request => {
      listCalls++;
      if (new URL(request.url()).searchParams.get('statuses') !== 'in_progress') return ok({ items: [], total: 0 });
      return ok({ items: [{ id: '1', title: '模拟作品', type: 1, status: 'in_progress' }], total: 1 });
    },
    'GET /api/creative-works/rankings': request => {
      expect(new URL(request.url()).searchParams.get('media')).toBe(kind === 'read' ? 'book' : 'movie');
      return rankings();
    },
  });
  await page.goto('/#/pages/records/library?kind=' + kind);
  if (kind === 'movie') {
    const records = page.getByRole('button', { name: '编辑记录', exact: true });
    await expect(records).toHaveCount(1);
    await expect(records).toHaveAccessibleDescription('模拟作品');
  } else {
    await expect(page.locator('.shelf-book[role=button]')).toHaveCount(1);
  }
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
    const trigger = page.getByRole('button', { name: '筛选观影', exact: true });
    const sheet = page.getByRole('dialog', { name: '快捷筛选', exact: true });
    await trigger.click();
    await expect(sheet.getByRole('button', { name: '加载榜单' })).toBeDisabled();
    await page.evaluate(() => {
      for (const value of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
    await expect(sheet).toBeHidden();
    await trigger.click();
    const retry = sheet.getByRole('button', { name: '重试榜单' });
    await expect(retry).toBeVisible();
    const before = listCalls();
    await retry.click();
    const ranking = sheet.getByRole('button', { name: '模拟榜单', exact: true });
    await expect(ranking).toBeVisible();
    const oldResponse = page.waitForResponse(response => response.url().includes('/creative-works/rankings'));
    release();
    await (await oldResponse).finished();
    await expect(ranking).toBeVisible();
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
      await expect.poll(listCalls).toBe(before + 4);
    };
    const trigger = page.getByRole('button', { name: '筛选阅读记录', exact: true });
    const filter = page.getByRole('dialog', { name: '快捷筛选', exact: true });
    const close = async () => {
      await filter.getByRole('button', { name: '关闭筛选', exact: true }).click();
      await expect(filter).toBeHidden();
    };
    await trigger.click();
    await expect(filter.getByRole('button', { name: '加载榜单' })).toBeDisabled();
    await close();
    await refresh();
    expect(calls).toBe(1);
    release();
    await trigger.click();
    await expect(filter.getByRole('button', { name: '重试榜单' })).toBeVisible();
    await close();
    await refresh();
    await trigger.click();
    await expect(filter.getByText('暂无榜单', { exact: true })).toBeVisible();
    await expect(filter.getByRole('button', { name: '重试榜单' })).toHaveCount(0);
    await close();
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
    const response = page.waitForResponse(response => response.url().includes('/creative-works/rankings'));
    release();
    await (await response).finished();
    await expect(search).toHaveValue('未提交的搜索词');
    await page.getByRole('button', { name: '筛选阅读记录', exact: true }).click();
    await expect(page.getByRole('button', { name: '模拟读书榜单', exact: true })).toBeVisible();
    expect(listCalls()).toBe(4);
  } finally { release(); }
});
