const { waitForMotion } = require('./support/motion');
const { stableBox } = require('./support/geometry');
const { test, expect } = require('./support/test');
const { setup, id } = require('./qa-records-fixtures.js');
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
    status: ['not_started', 'in_progress', 'completed', 'on_hold'][i % 4],
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
      return route.fulfill({ json: { code: 0, message: null, data: { items, total: items.length } } });
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
  await expect(page.locator(kind === 'movie' ? '.library-card' : '.shelf-book[role=button]')).toHaveCount(9);
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
        if (kind === 'movie') await expect(page.locator('.library-status').first()).toHaveText('想看');
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
          .locator(kind === 'movie' ? '.library-poster' : '.shelf-cover')
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
          const card = await page.locator('.library-card').first().boundingBox();
          expect(boxes[0].width / card.width).toBeCloseTo(0.88, 2);
          const badgeBox = await badge.boundingBox();
          expect(badgeBox.y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 1);
          const columns = width >= 1200 ? 7 : width >= 768 ? 5 : width >= 640 ? 4 : 3;
          expect(boxes.filter((b) => b.y === boxes[0].y)).toHaveLength(columns);
        } else {
          const book = page.getByRole('button', { name: '编辑《' + state.movies[0].title + '》', exact: true });
          await expect(book.locator('.shelf-badge')).toHaveText('豆瓣 Top 250');
          await expect(page.locator('.shelf-badge')).toHaveCount(1);
          await expect(book).not.toContainText('No.34');
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
        for (const label of [kind === 'movie' ? '电影' : '书籍', kind === 'movie' ? '在看' : '在读', '豆瓣 Top250']) {
          await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
        }
        if (kind === 'movie') await expect(sheet.getByText('9 条', { exact: true })).toBeVisible();
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
    await expect(page.locator(kind === 'movie' ? '.library-card' : '.shelf-book[role=button]')).toHaveCount(8);
    expect(state.writes.at(-1).method).toBe('DELETE');
    const base = kind === 'movie' ? '/movie/page' : '/read-record/page';
    await page.getByRole('button', { name: '展开搜索', exact: true }).click();
    const searchInput = page.locator(kind === 'movie' ? '[aria-label="搜索观影"] input' : '[aria-label="搜索阅读记录"] input');
    await searchInput.fill('模拟搜索');
    const search = page.waitForRequest(
      (r) =>
        r.url().includes(base) &&
        new URL(r.url()).searchParams.get('title') === '模拟搜索',
    );
    await searchInput.press('Enter');
    await search;
    await waitForMotion(page);
    const filter = page.getByRole('button', { name: kind === 'movie' ? '筛选观影' : '筛选阅读记录', exact: true });
    const sheet = page.getByRole('dialog', { name: '快捷筛选', exact: true });
    const status = sheet.getByRole('button', { name: kind === 'movie' ? '在看' : '在读', exact: true });
    const apply = sheet.getByRole('button', { name: '确定', exact: true });
    await filter.click();
    await expect(sheet.getByRole('button', { name: '不限', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('button', { pressed: true })).toHaveCount(0);
    await status.click();
    await expect(status).toHaveAttribute('aria-pressed', 'true');
    await status.click();
    await expect(status).toHaveAttribute('aria-pressed', 'false');
    await status.click();
    await expect(status).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '关闭筛选', exact: true }).click();
    await expect(filter).toHaveAttribute('aria-expanded', 'false');
    await expect(filter).not.toHaveAttribute('aria-description', '已启用筛选');

    await filter.click();
    await expect(status).toHaveAttribute('aria-pressed', 'false');
    await sheet.getByRole('button', { name: kind === 'movie' ? '电影' : '书籍', exact: true }).click();
    await status.click();
    await sheet.getByRole('button', { name: '豆瓣 Top250', exact: true }).click();
    await page.screenshot({ path: info.outputPath('library-filter-selected.png') });
    const [filtered] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(base)),
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
    await expect(status).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '重置', exact: true }).click();
    await expect(sheet.getByRole('button', { pressed: true })).toHaveCount(0);
    const [cleared] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(base)),
      apply.click(),
    ]);
    const clearedQuery = new URL(cleared.url()).searchParams;
    expect(clearedQuery.get('title')).toBe('模拟搜索');
    expect(clearedQuery.has('type')).toBe(false);
    expect(clearedQuery.getAll('statuses')).toHaveLength(kind === 'read' ? 1 : 0);
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
