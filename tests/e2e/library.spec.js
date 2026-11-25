const { waitForMotion } = require('./support/motion');
const { stableBox } = require('./support/geometry');
const { test, expect } = require('./support/test');
const { setup, id } = require('./qa-records-fixtures.js');
const spacing = require('../../src/styles/spacing.json');
const fs = require('node:fs');
const cover = fs.readFileSync(
  require('node:path').join(__dirname, '../..', 'src/static/book.png'),
);
async function library(page, kind) {
  const state = await setup(page);
  state.movies = Array.from({ length: 9 }, (_, i) => ({
    id: i === 0 ? id : String(i),
    title: `模拟${kind === 'movie' ? '影片' : '书籍'} ${i + 1}`,
    type: 1,
    status: kind === 'movie' ? 'in_progress' : ['not_started', 'in_progress', 'completed', 'on_hold'][i % 4],
    director: '模拟导演',
    author: '模拟作者',
    currentProgress: 0,
    totalProgress: 113,
    rankings: i === 0 ? [{ rankingListId: '12', name: kind === 'movie' ? '豆瓣电影Top250' : '豆瓣读书Top250', rank: 34 }] : [],
    fileId: i < 6 ? 'cover-' + i : '',
    url: '',
    coverImgUrl: '',
    finishDate: i % 4 === 2 ? '2026-10-01' : null,
    doubanSubjectId: '9223372036854775806',
    remark: '模拟备注',
  }));
  await page.route(
    '**/api/' + (kind === 'movie' ? 'movie' : 'read-record') + '/page?**',
    route => {
      const params = new URL(route.request().url()).searchParams;
      const items = state.movies.filter(item =>
        (!params.has('statuses') || item.status === params.get('statuses')) &&
        (!params.has('title') || item.title.includes(params.get('title'))) &&
        (!params.has('type') || item.type === Number(params.get('type'))) &&
        (!params.has('rankingListId') || item.rankings.some(badge => badge.rankingListId === params.get('rankingListId'))));
      const pageSize = Number(params.get('pageSize'));
      const offset = (Number(params.get('page')) - 1) * pageSize;
      return route.fulfill({ json: { code: 0, message: null, data: {
        items: items.slice(offset, offset + pageSize), total: items.length,
      } } });
    },
  );
  state.coverHeaders = [];
  await page.route('**/api/file/preview/*', async (route) => {
    state.coverHeaders.push(route.request().headers());
    if (state.coverFail) return route.fulfill({ status: 500, body: '' });
    return route.fulfill({ contentType: 'image/png', body: cover });
  });
  await page.route('**/api/creative-works/rankings?**', route =>
    route.fulfill({ json: { code: 0, data: [{ id: '12', name: kind === 'movie' ? '豆瓣电影Top250' : '豆瓣读书Top250' }] } }));
  await page.goto('/#/pages/records/library?kind=' + kind);
  await page.reload();
  await expect(page.getByRole('button', { name: kind === 'movie' ? '编辑记录' : /^编辑《/ })).toHaveCount(9);
  return state;
}
for (const kind of ['movie', 'read'])
  for (const width of [320, 390, 768, 1440])
    for (const theme of ['light', 'dark']) {
      test(`封面网格 ${kind} ${width} ${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const state = await library(page, kind);
        await expect(page.locator('.library-cover-image')).toHaveCount(6);
        await expect(page.locator('.library-cover-hint')).toHaveCount(0);
        expect(
          state.coverHeaders.every(
            (h) => h.authorization === 'Bearer records-fixture',
          ),
        ).toBe(true);
        if (kind === 'movie') {
          const tabs = page.getByRole('group', { name: '观影状态', exact: true });
          const selected = tabs.getByRole('button', { name: '进行中，9 条', exact: true });
          const firstPoster = page.getByRole('button', { name: '编辑记录', exact: true }).first();
          await expect(tabs.getByRole('button')).toHaveText([/进行中\s*9/, /已完成\s*0/, /未开始\s*0/, /已暂停\s*0/]);
          await expect(selected).toHaveAttribute('aria-pressed', 'true');
          await expect(firstPoster).not.toContainText(/想看|在看|看过|搁置|进行中/);
          await waitForMotion(page);
          const [tabBox, posterBox, underlineBox] = await Promise.all([
            stableBox(selected), stableBox(firstPoster), stableBox(tabs.locator('.category-underline-moving')),
          ]);
          expect(posterBox.y - tabBox.y - tabBox.height).toBeCloseTo(spacing.section, 0);
          expect(tabBox.y + tabBox.height - underlineBox.y - underlineBox.height).toBeCloseTo(spacing.micro, 0);
        }
        else await expect(page.locator('.shelf-label')).toHaveText(['在读', '读过', '想读', '搁置']);
        await expect(page.locator(kind === 'movie' ? '.library-date' : '.shelf-date').first()).toHaveText(
          kind === 'movie' ? '2026-10-01' : '10月1日',
        );
        await expect(
          page.getByRole('button', { name: '预览附件' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: '删除记录' }),
        ).toHaveCount(0);
        const boxes = await page
          .locator(kind === 'movie' ? '.library-poster[role=button]' : '.shelf-cover')
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const r = n.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                right: r.right,
              };
            }),
          );
        if (kind === 'movie') {
          const badge = page.locator('.library-ranking').first();
          await expect(badge).toContainText('No.34');
          await expect(badge.getByText('豆瓣 Top250', { exact: true })).toBeVisible();
          const card = await page.locator('.library-card').filter({ has: page.getByRole('button', { name: '编辑记录', exact: true }) }).first().boundingBox();
          expect(boxes[0].width / card.width).toBeCloseTo(0.88, 2);
          const badgeBox = await badge.boundingBox();
          expect(badgeBox.y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 1);
          const columns = width >= 1200 ? 7 : width >= 768 ? 5 : width >= 640 ? 4 : 3;
          expect(boxes.filter((b) => b.y === boxes[0].y)).toHaveLength(columns);
        } else {
          const book = page.getByRole('button', { name: '编辑《' + state.movies[0].title + '》', exact: true });
          const badge = book.locator('.shelf-badge');
          await expect(badge.getByText('No.34', { exact: true })).toBeVisible();
          await expect(badge.getByText('豆瓣 Top250', { exact: true })).toBeVisible();
          await expect(book).toHaveAccessibleDescription('豆瓣 Top250 第34名');
          await expect(page.locator('.shelf-badge')).toHaveCount(1);
          const coverBox = await book.locator('.shelf-cover').boundingBox();
          const titleBox = await book.locator('.shelf-title').boundingBox();
          expect(titleBox.x).toBeGreaterThan(coverBox.x + coverBox.width);
          expect(boxes.filter(box => box.y === boxes[0].y)).toHaveLength(2);
        }
        expect(boxes.every((b) => b.x >= 0 && b.right <= width)).toBe(true);
        expect(Math.abs(boxes[0].height / boxes[0].width - 4 / 3)).toBeLessThan(
          0.03,
        );
        await page.screenshot({ path: info.outputPath('library.png') });
        const searchButton = page.getByRole('button', { name: '展开搜索', exact: true });
        const search = await searchButton.boundingBox();
        const filter = page.getByRole('button', { name: kind === 'movie' ? '筛选观影' : '筛选阅读记录', exact: true });
        const sheet = page.getByRole('dialog', { name: '快捷筛选', exact: true });
        await expect(filter).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet).toBeHidden();
        await expect(page.getByText('9 条', { exact: true })).toBeHidden();
        const filterBox = await filter.boundingBox();
        expect(filterBox.width).toBeGreaterThanOrEqual(44);
        expect(filterBox.height).toBeGreaterThanOrEqual(44);
        expect(search.x + search.width).toBeLessThanOrEqual(filterBox.x);
        expect(filterBox.y + filterBox.height / 2).toBeCloseTo(search.y + search.height / 2, 0);
        expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(width);
        if (kind === 'movie') {
          const importBox = await page.getByRole('button', { name: '豆瓣导入', exact: true }).boundingBox();
          expect(importBox.x + importBox.width).toBeLessThanOrEqual(search.x);
          expect(importBox.y + importBox.height / 2).toBeCloseTo(search.y + search.height / 2, 0);
        }
        await filter.click();
        await expect(filter).toHaveAttribute('aria-expanded', 'true');
        for (const label of kind === 'movie' ? ['电影', '豆瓣 Top250'] : ['书籍', '在读', '豆瓣 Top250']) {
          await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
        }
        if (kind === 'movie') {
          await expect(sheet.getByRole('group', { name: '观影状态', exact: true })).toHaveCount(0);
          await expect(sheet.getByText('9 条', { exact: true })).toBeVisible();
        }
        const sheetBox = await stableBox(sheet);
        expect(sheetBox.y + sheetBox.height).toBeCloseTo(900, 0);
        expect(sheetBox.width).toBeLessThanOrEqual(Math.min(width, 480));
        await page.screenshot({ path: info.outputPath('library-filters.png') });
        await sheet.getByRole('button', { name: '关闭筛选', exact: true }).click();
        await expect(sheet).toBeHidden();
        await page
          .getByRole('button', { name: kind === 'movie' ? '编辑记录' : '编辑《' + state.movies[0].title + '》', exact: true })
          .first()
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.locator('[aria-label="名称"] input')).toHaveValue(
          state.movies[0].title,
        );
        await page.getByRole('button', { name: '取消', exact: true }).click();
        await page
          .getByRole('button', {
            name: kind === 'movie' ? '新增观影' : '新增阅读记录',
            exact: true,
          })
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: '取消', exact: true }).click();
        expect(errors).toEqual([]);
      });
    }
for (const kind of ['movie', 'read'])
  test(`编辑恢复、删除和筛选 ${kind}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const state = await library(page, kind);
    await page
      .getByRole('button', { name: kind === 'movie' ? '编辑记录' : '编辑《' + state.movies[0].title + '》', exact: true })
      .first()
      .click();
    await page.locator('[aria-label="名称"] input').fill('模拟修改');
    state.fail = true;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('模拟保存失败', { exact: true })).toBeVisible();
    state.fail = false;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.writes.at(-1).body.fileId).toBe('cover-0');
    expect(state.writes.at(-1).body).not.toHaveProperty('doubanSubjectId');
    expect(state.movies[0].doubanSubjectId).toBe('9223372036854775806');
    expect(state.writes.at(-1).body.id).toBe(id);
    await page
      .getByRole('button', { name: kind === 'movie' ? '编辑记录' : '编辑《' + state.movies[0].title + '》', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: '删除记录', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '删除记录', exact: true });
    await expect(confirm).toContainText('确定删除“模拟修改”？');
    state.fail = true;
    await confirm.getByRole('button', { name: '确认', exact: true }).click();
    await expect(confirm).toContainText('模拟保存失败');
    state.fail = false;
    await confirm.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: kind === 'movie' ? '编辑记录' : /^编辑《/ })).toHaveCount(8);
    expect(state.writes.at(-1).method).toBe('DELETE');
    const base = kind === 'movie' ? '/movie/page' : '/read-record/page';
    await page.getByRole('button', { name: '展开搜索', exact: true }).click();
    const searchInput = page.locator(kind === 'movie' ? '[aria-label="搜索观影"] input' : '[aria-label="搜索阅读记录"] input');
    await searchInput.fill('模拟搜索');
    const search = page.waitForRequest(
      (r) =>
        r.url().includes(base) &&
        new URL(r.url()).searchParams.get('pageSize') !== '1' &&
        new URL(r.url()).searchParams.get('title') === '模拟搜索',
    );
    await searchInput.press('Enter');
    await search;
    await waitForMotion(page);
    const filter = page.getByRole('button', { name: kind === 'movie' ? '筛选观影' : '筛选阅读记录', exact: true });
    const sheet = page.getByRole('dialog', { name: '快捷筛选', exact: true });
    const status = sheet.getByRole('button', { name: '在读', exact: true });
    const type = sheet.getByRole('button', { name: kind === 'movie' ? '电影' : '书籍', exact: true });
    const choice = kind === 'movie' ? type : status;
    const apply = sheet.getByRole('button', { name: '确定', exact: true });
    await filter.click();
    await expect(sheet.getByRole('button', { name: '不限', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { pressed: true })).toHaveCount(0);
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'false');
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '关闭筛选', exact: true }).click();
    await expect(filter).toHaveAttribute('aria-expanded', 'false');
    await expect(filter).not.toHaveAttribute('aria-description', '已启用筛选');

    await filter.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'false');
    await type.click();
    if (kind === 'read') await status.click();
    await sheet.getByRole('button', { name: '豆瓣 Top250', exact: true }).click();
    await page.screenshot({ path: info.outputPath('library-filter-selected.png') });
    const [filtered] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(base) && new URL(response.url()).searchParams.get('pageSize') !== '1'),
      apply.click(),
    ]);
    const query = new URL(filtered.url()).searchParams;
    expect(query.get('page')).toBe('1');
    expect(query.get('title')).toBe('模拟搜索');
    expect(query.get('type')).toBe('1');
    expect(query.getAll('statuses')).toEqual(['in_progress']);
    expect(query.get('rankingListId')).toBe('12');
    await expect(page.locator('[role="dialog"][aria-label="快捷筛选"]')).toHaveCount(0);
    await expect(filter).toHaveAttribute('aria-description', '已启用筛选');
    await page.screenshot({ path: info.outputPath('library-filter-active.png') });

    await filter.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '重置', exact: true }).click();
    await expect(sheet.getByRole('button', { pressed: true })).toHaveCount(0);
    const [cleared] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(base) && new URL(response.url()).searchParams.get('pageSize') !== '1'),
      apply.click(),
    ]);
    const clearedQuery = new URL(cleared.url()).searchParams;
    expect(clearedQuery.get('title')).toBe('模拟搜索');
    expect(clearedQuery.has('type')).toBe(false);
    expect(clearedQuery.getAll('statuses')).toHaveLength(1);
    expect(clearedQuery.get('pageSize')).toBe(kind === 'read' ? '7' : '30');
    expect(clearedQuery.has('rankingListId')).toBe(false);
    await expect(sheet).toBeHidden();
    await expect(filter).not.toHaveAttribute('aria-description', '已启用筛选');
  });
test('封面失败可局部重试，不误打开编辑', async ({ page }) => {
  const state = await library(page, 'movie');
  state.coverFail = true;
  await page.reload();
  await expect(page.getByRole('button', { name: '重试封面' })).toHaveCount(6);
  state.coverFail = false;
  await page.getByRole('button', { name: '重试封面' }).first().click();
  await expect(page.getByRole('button', { name: '重试封面' })).toHaveCount(5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`观影骨架按状态数量显示 ${width} ${colorScheme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'movie-skeleton-fixture'));
    const totals = { in_progress: 3, not_started: 1, on_hold: 0, completed: 48 };
    const attempts = {};
    function gate() {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      return { promise, release };
    }
    const lists = {
      in_progress: [gate()], not_started: [gate(), gate()], on_hold: [gate()], completed: [gate()],
    };
    const ok = data => ({ json: { code: 0, message: null, data } });
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: ['admin'] }),
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/creative-works/rankings': ok([]),
      'GET /api/movie/page': async request => {
        const query = new URL(request.url()).searchParams;
        const status = query.get('statuses');
        const size = Number(query.get('pageSize'));
        const number = Number(query.get('page'));
        expect(Object.hasOwn(totals, status)).toBe(true);
        if (size === 30 && number === 1) {
          const attempt = attempts[status] ?? 0;
          attempts[status] = attempt + 1;
          await lists[status][attempt]?.promise;
          if (status === 'not_started' && attempt === 0) {
            return { json: { code: 1, message: '模拟观影列表失败', data: null } };
          }
        }
        const total = totals[status];
        const offset = (number - 1) * size;
        const items = Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, index) => ({
          id: String(offset + index + 1), status, type: 1,
          title: `模拟影片 ${offset + index + 1}：用于检查长标题在海报中的显示效果`,
        }));
        return ok({ items, total });
      },
    });
    try {
      await page.goto('/#/pages/records/library?kind=movie');
      const tabs = page.getByRole('group', { name: '观影状态', exact: true });
      const active = page.locator('.category-pager-active');
      const loading = active.getByRole('status', { name: '正在加载观影记录', exact: true });
      const placeholders = loading.locator('.library-poster');
      const cards = active.getByRole('button', { name: '编辑记录', exact: true });
      const empty = active.getByText('暂无记录', { exact: true });
      await expect(tabs.getByRole('button', { name: '进行中', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(placeholders).toHaveCount(9);
      lists.in_progress[0].release();
      await expect(cards).toHaveCount(3);

      await tabs.getByRole('button', { name: '已暂停，0 条', exact: true }).click();
      await expect(loading).toBeInViewport();
      await expect(placeholders).toHaveCount(0);
      await expect(empty).toBeHidden();
      const emptyLoading = await stableBox(active.locator('.page-state'));
      lists.on_hold[0].release();
      await expect(empty).toBeInViewport();
      const emptyLoaded = await stableBox(active.locator('.page-state'));
      expect(emptyLoaded.height).toBeCloseTo(emptyLoading.height, 0);

      await tabs.getByRole('button', { name: '未开始，1 条', exact: true }).click();
      await expect(placeholders).toHaveCount(1);
      lists.not_started[0].release();
      await expect(active.getByRole('alert')).toContainText('模拟观影列表失败');
      await active.getByRole('button', { name: '重试', exact: true }).click();
      await expect(placeholders).toHaveCount(1);
      const loadingPoster = await stableBox(placeholders.first());
      lists.not_started[1].release();
      await expect(cards).toHaveCount(1);
      const loadedPoster = await stableBox(cards.first());
      expect(loadedPoster.y).toBeCloseTo(loadingPoster.y, 0);
      expect(loadedPoster.height).toBeCloseTo(loadingPoster.height, 0);

      await tabs.getByRole('button', { name: '已完成，48 条', exact: true }).click();
      await expect(placeholders).toHaveCount(30);
      await expect.poll(async () => (await placeholders.first().boundingBox()).x).toBeCloseTo(loadedPoster.x, 0);
      await page.screenshot({ path: info.outputPath('movie-loading.png') });
      lists.completed[0].release();
      await expect(cards).toHaveCount(30);
      await expect(loading).toBeHidden();
      await expect(cards.first()).toBeInViewport();
      await page.screenshot({ path: info.outputPath('movie-loaded.png') });
    } finally {
      Object.values(lists).flat().forEach(pending => pending.release());
    }
  });
}

test('观影状态各自分页，失败后在原状态重试', async ({ page, apiMock }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'movie-status-fixture'));
  const groups = { not_started: 1, in_progress: 32, on_hold: 0, completed: 2 };
  const requests = [];
  let failNext = true;
  const ok = data => ({ json: { code: 0, message: null, data } });
  apiMock({
    'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: ['admin'] }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/creative-works/rankings': ok([]),
    'GET /api/movie/page': request => {
      const query = new URL(request.url()).searchParams;
      const status = query.get('statuses');
      const number = Number(query.get('page'));
      const size = Number(query.get('pageSize'));
      expect(Object.hasOwn(groups, status)).toBe(true);
      expect(query.getAll('statuses')).toEqual([status]);
      expect([1, 30]).toContain(size);
      if (size === 30) requests.push([status, number]);
      if (status === 'in_progress' && number === 2 && failNext) {
        failNext = false;
        return { json: { code: 1, message: '模拟观影分页失败', data: null } };
      }
      const total = groups[status];
      const offset = (number - 1) * size;
      const items = Array.from({ length: Math.min(size, total - offset) }, (_, index) => ({
        id: String(offset + index + 1), title: `模拟影片 ${status} ${offset + index + 1}`, type: 1, status,
      }));
      return ok({ items, total });
    },
  });
  await page.goto('/#/pages/records/library?kind=movie');
  const tabs = page.getByRole('group', { name: '观影状态', exact: true });
  const cards = page.getByRole('button', { name: '编辑记录', exact: true });
  const retry = page.getByRole('button', { name: '重试加载', exact: true });
  await expect(tabs.getByRole('button')).toHaveText([/进行中\s*32/, /已完成\s*2/, /未开始\s*1/, /已暂停\s*0/]);
  await expect(cards).toHaveCount(30);
  await waitForMotion(page);
  await page.mouse.move(190, 460);
  await page.mouse.wheel(0, 100_000);
  await expect(page.getByRole('alert')).toContainText('模拟观影分页失败');
  await expect(cards).toHaveCount(30);
  await retry.click();
  await expect(cards).toHaveCount(32);
  await expect(retry).toBeHidden();
  const completed = tabs.getByRole('button', { name: '已完成，2 条', exact: true });
  const notStarted = tabs.getByRole('button', { name: '未开始，1 条', exact: true });
  const underline = tabs.locator('.category-underline-moving');
  const [before, destination] = await Promise.all([stableBox(underline), stableBox(completed)]);
  const viewport = await stableBox(page.locator('.category-pager'));
  const firstDragX = Math.round(viewport.x + viewport.width * 0.7);
  const dragY = Math.round(viewport.y + 80);
  await page.mouse.move(firstDragX, dragY);
  await page.mouse.down();
  await page.mouse.move(firstDragX - viewport.width / 3, dragY, { steps: 6 });
  try {
    const during = await stableBox(underline);
    expect(during.x).toBeCloseTo(before.x + (destination.x - before.x) / 3, 0);
    await expect(completed).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(firstDragX, dragY, { steps: 6 });
  } finally {
    await page.mouse.up();
  }
  await expect.poll(async () => (await underline.boundingBox()).x).toBeCloseTo(before.x, 0);
  await waitForMotion(page);
  await page.mouse.move(190, 460);
  for (let step = 0; step < 4; step++) await page.mouse.wheel(65, 0);
  await page.waitForFunction(() => {
    const animation = document.querySelector('.category-underline-moving')?.getAnimations()
      .find(item => item.transitionProperty === 'transform');
    if (!animation) return false;
    animation.pause();
    animation.currentTime = 90;
    return true;
  });
  try {
    const moving = await stableBox(underline);
    expect(moving.x).toBeGreaterThan(before.x);
    expect(moving.x).toBeLessThan(destination.x);
  } finally {
    await underline.evaluate(element => element.getAnimations().forEach(animation => animation.play()));
  }
  await expect(completed).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute('aria-description', '模拟影片 completed 1');
  await waitForMotion(page);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const tabBar = await stableBox(tabs);
  const y = Math.round(tabBar.y + tabBar.height / 2);
  const start = Math.round(tabBar.x + tabBar.width * 0.65);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let step = 1; step <= 8; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start - step * 18, y }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  await expect(notStarted).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('aria-description', '模拟影片 not_started 1');
  await waitForMotion(page);
  await page.mouse.move(start - 120, y);
  await page.mouse.down();
  await page.mouse.move(start, y, { steps: 8 });
  await page.mouse.up();
  await expect(completed).toHaveAttribute('aria-pressed', 'true');
  await waitForMotion(page);
  const contentTouch = await page.context().newCDPSession(page);
  await contentTouch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchX = Math.round(viewport.x + viewport.width * 0.2);
  await contentTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: dragY }] });
  try {
    for (let step = 1; step <= 10; step++) {
      await contentTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + step * 22, y: dragY }] });
      if (step === 5) {
        const during = await stableBox(underline);
        expect(during.x).toBeLessThan(destination.x);
        expect(during.x).toBeGreaterThan(before.x);
        await expect(completed).toHaveAttribute('aria-pressed', 'true');
      }
    }
  } finally {
    await contentTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await contentTouch.detach();
  }
  await expect(tabs.getByRole('button', { name: '进行中，32 条', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(32);
  await expect(cards.last()).toBeInViewport();
  await expect.poll(async () => (await underline.boundingBox()).x).toBeCloseTo(before.x, 0);
  const paused = tabs.getByRole('button', { name: '已暂停，0 条', exact: true });
  await paused.click();
  await expect(paused).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('暂无记录', { exact: true })).toBeInViewport();
  await expect(cards).toHaveCount(0);
  expect(requests).toEqual([['in_progress', 1], ['in_progress', 2], ['in_progress', 2], ['completed', 1], ['not_started', 1], ['on_hold', 1]]);
});
