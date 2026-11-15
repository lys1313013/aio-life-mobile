const { waitForMotion } = require('./support/motion');
const { test, expect } = require('./support/test');
const fs = require('node:fs');
const path = require('node:path');
const id = '9223372036854775807';
const content = Array.from({ length: 14 }, (_, i) => `模拟段落 ${i + 1}\n记录生活中的想法，长笔记应当随整页自然滚动。编辑、收藏和保存都应保留完整正文。`).join('\n\n');
const ok = data => ({ json: { code: 0, message: null, data } });
async function setup(page, apiMock, { delay = false, failure = false } = {}) {
  let release;
  const gate = delay ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const state = { detail: { id, title: '模拟长笔记', content, favorite: false, hiddenContent: true, updateTime: '2026-11-15 12:00:00' }, writes: [], failure, deleted: false, gets: 0, pauseSave: null };
  apiMock({
    'GET /api/menu/all': ok([{ path: '/record/memo', meta: { menuId: 'memo', title: '笔记' } }]),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/memo/query': request => {
      const url = new URL(request.url());
      expect(url.searchParams.get('page')).toBe('1');
      return ok({ items: state.deleted ? [] : [state.detail], total: state.deleted ? 0 : 1 });
    },
    ['GET /api/memo/' + id]: async () => {
      state.gets++; await gate;
      return state.failure ? { json: { code: 1, message: '模拟读取失败', data: null } } : ok(state.detail);
    },
    ['PUT /api/memo/' + id]: async request => {
      const body = request.postDataJSON(); state.writes.push(body);
      if (state.failure) return { json: { code: 1, message: '模拟保存失败', data: null } };
      if (state.pauseSave) await state.pauseSave;
      Object.assign(state.detail, body); return ok(true);
    },
    'POST /api/memo': async request => {
      const body = request.postDataJSON(); state.writes.push(body);
      if (state.pauseSave) await state.pauseSave;
      state.detail = { ...state.detail, ...body }; return ok(true);
    },
    ['DELETE /api/memo/' + id]: () => { state.deleted = true; return ok(true); },
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-note-editor' })));
  return { state, release: () => release?.() };
}
const titleInput = page => page.getByRole('textbox', { name: '标题', exact: true });
const bodyInput = page => page.getByRole('textbox', { name: '内容', exact: true });

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`整页笔记加载、长文滚动、收藏与保存恢复 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const fixture = await setup(page, apiMock, { delay: true });
    const dir = path.resolve('artifacts/note-editor'); fs.mkdirSync(dir, { recursive: true });
    try {
      await page.goto('/#/pages/records/notes?kind=memo');
      await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
      await expect(page).toHaveURL(new RegExp('records/note-edit\\?id=' + id));
      await expect(page.getByRole('status', { name: '正在加载笔记', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await waitForMotion(page);
      const loadingTitle = await page.locator('.note-skeleton-title').boundingBox();
      const more = await page.getByRole('button', { name: '更多操作', exact: true }).boundingBox();
      const save = await page.getByRole('button', { name: '保存', exact: true }).boundingBox();
      expect(more.x).toBeGreaterThan(save.x + save.width - 1);
      await page.screenshot({ path: path.join(dir, `loading-${width}-${theme}.png`) });
      fixture.release();
      await expect(bodyInput(page)).toHaveValue(content);
      const loadedTitle = await page.locator('.note-title').boundingBox();
      expect(Math.abs(loadingTitle.y - loadedTitle.y)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: path.join(dir, `editor-${width}-${theme}.png`) });
      const scroll = page.locator('.note-scroll .uni-scroll-view[style]');
      await scroll.hover(); await page.mouse.wheel(0, 650);
      await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
      await expect(page.getByRole('button', { name: '更多操作', exact: true })).toBeVisible();
      await titleInput(page).fill('模拟未保存标题');
      fixture.state.failure = true;
      await page.getByRole('button', { name: '收藏笔记', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('模拟保存失败');
      await expect(page.getByRole('button', { name: '收藏笔记', exact: true })).toHaveAttribute('aria-pressed', 'false');
      fixture.state.failure = false;
      let releaseFavorite;
      fixture.state.pauseSave = new Promise(resolve => { releaseFavorite = resolve; });
      try {
        const favorite = page.getByRole('button', { name: '收藏笔记', exact: true });
        await favorite.click();
        await expect(favorite.getByRole('status', { name: '正在保存收藏', exact: true })).toBeVisible();
        await expect(favorite.locator('.category-icon-image')).toBeVisible();
        await expect(favorite.locator('.loading-track')).toHaveCount(0);
        await page.screenshot({ path: path.join(dir, `favorite-loading-${width}-${theme}.png`) });
      } finally { releaseFavorite(); fixture.state.pauseSave = null; }
      await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const star = await page.getByRole('button', { name: '取消收藏', exact: true }).locator('img').getAttribute('src');
      expect(Buffer.from(star.split(',')[1], 'base64').toString()).toContain(theme === 'dark' ? '#f6c94c' : '#bd8700');
      await expect(page.locator('.note-save-label')).toHaveCSS('color', theme === 'dark' ? 'rgb(122, 167, 255)' : 'rgb(37, 99, 235)');
      expect(fixture.state.writes.at(-1)).toEqual({ favorite: true });
      await expect(titleInput(page)).toHaveValue('模拟未保存标题');
      await expect(bodyInput(page)).toHaveValue(content);
      await page.getByRole('button', { name: '更多操作', exact: true }).click();
      await page.getByRole('button', { name: '在列表中显示正文', exact: true }).click();
      await expect(page.getByRole('button', { name: '更多操作', exact: true })).toHaveAttribute('aria-expanded', 'false');
      expect(fixture.state.writes.at(-1)).toEqual({ hiddenContent: false });
      await page.getByRole('button', { name: '返回', exact: true }).click();
      const exit = page.getByRole('dialog', { name: '保存这次修改', exact: true });
      await expect(exit).toBeVisible();
      await exit.getByRole('button', { name: '继续编辑', exact: true }).click();
      fixture.state.failure = true;
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('模拟保存失败');
      await expect(titleInput(page)).toHaveValue('模拟未保存标题');
      fixture.state.failure = false;
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByText('已保存', { exact: true })).toBeVisible();
      expect(fixture.state.writes.at(-1)).toEqual({ title: '模拟未保存标题', content });
      await expect(bodyInput(page)).toHaveValue(content);
      await page.getByRole('button', { name: '更多操作', exact: true }).click();
      await page.getByRole('button', { name: '删除笔记', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: '删除笔记', exact: true });
      await expect(deletion).toContainText('删除后无法恢复');
      await deletion.getByRole('button', { name: '取消', exact: true }).click();
      await page.screenshot({ path: path.join(dir, `menu-${width}-${theme}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { fixture.release(); }
  });
}

test('笔记读取失败重试，不能把加载失败当空白新增', async ({ page, apiMock }) => {
  const { state } = await setup(page, apiMock, { failure: true });
  await page.goto('/#/pages/records/note-edit?id=' + id);
  await expect(page.getByRole('alert')).toContainText('模拟读取失败');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  state.failure = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(bodyInput(page)).toHaveValue(content);
  expect(state.gets).toBe(2);
});

test('新增笔记收藏随创建保存，重复点击只发送一次', async ({ page, apiMock }) => {
  const { state } = await setup(page, apiMock);
  let release;
  state.pauseSave = new Promise(resolve => { release = resolve; });
  try {
    await page.goto('/#/pages/records/note-edit');
    await titleInput(page).fill('模拟新增'); await bodyInput(page).fill('模拟正文');
    await page.getByRole('button', { name: '收藏笔记', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    expect(state.writes).toEqual([{ title: '模拟新增', content: '模拟正文', favorite: true, hiddenContent: false }]);
    release();
    await expect(page).toHaveURL(/records\/notes\?kind=memo/);
    await expect(page.getByRole('button', { name: '编辑笔记：模拟新增', exact: true })).toBeVisible();
  } finally { release(); }
});

test('删除后返回列表，未保存退出不提交正文', async ({ page, apiMock }) => {
  const { state } = await setup(page, apiMock);
  await page.goto('/#/pages/records/notes?kind=memo');
  await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
  await titleInput(page).fill('模拟丢弃修改');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('dialog', { name: '保存这次修改', exact: true }).getByRole('button', { name: '不保存', exact: true }).click();
  await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
  await expect(titleInput(page)).toHaveValue('模拟长笔记');
  expect(state.writes).toEqual([]);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除笔记', exact: true }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL(/records\/notes\?kind=memo/);
  await expect(page.getByRole('button', { name: '编辑笔记', exact: true })).toHaveCount(0);
  expect(state.deleted).toBe(true);
});

test('详情尚未返回可离页，晚到的正文不会重新打开编辑器', async ({ page, apiMock }) => {
  const fixture = await setup(page, apiMock, { delay: true });
  try {
    await page.goto('/#/pages/records/notes?kind=memo');
    await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
    await expect(page.getByRole('status', { name: '正在加载笔记', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page).toHaveURL(/records\/notes\?kind=memo/);
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/memo/' + id);
    fixture.release(); await (await response).finished();
    await expect(page.getByRole('button', { name: '编辑笔记', exact: true })).toBeVisible();
    await expect(bodyInput(page)).toHaveCount(0);
  } finally { fixture.release(); }
});
