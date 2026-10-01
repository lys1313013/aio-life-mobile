const { test, expect } = require('@playwright/test');
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
    fileId: i < 6 ? 'cover-' + i : '',
    url: '',
    coverImgUrl: '',
    finishTime: i % 4 === 2 ? '2026-10-01 12:00:00' : null,
    doubanSubjectId: '9223372036854775806',
    remark: '模拟备注',
  }));
  await page.route(
    '**/api/' + (kind === 'movie' ? 'movie' : 'read-record') + '/page?**',
    (route) =>
      route.fulfill({
        json: {
          rscode: '0',
          data: { records: state.movies, total: state.movies.length },
        },
      }),
  );
  state.coverHeaders = [];
  await page.route('**/api/file/preview/*', async (route) => {
    state.coverHeaders.push(route.request().headers());
    if (state.coverFail) return route.fulfill({ status: 500, body: '' });
    return route.fulfill({ contentType: 'image/png', body: cover });
  });
  await page.goto('/#/pages/records/library?kind=' + kind);
  await page.reload();
  await expect(page.locator('.library-card')).toHaveCount(9);
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
        await expect(page.locator('.library-status').first()).toHaveText(
          kind === 'movie' ? '想看' : '想读',
        );
        await expect(page.locator('.library-date').first()).toHaveText(
          '2026-10-01',
        );
        await expect(
          page.getByRole('button', { name: '预览附件' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: '删除记录' }),
        ).toHaveCount(0);
        const boxes = await page
          .locator('.library-poster')
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
        const columns = width >= 1200 ? 7 : width >= 768 ? 5 : 3;
        expect(boxes.filter((b) => b.y === boxes[0].y)).toHaveLength(columns);
        expect(boxes.every((b) => b.x >= 0 && b.right <= width)).toBe(true);
        expect(Math.abs(boxes[0].height / boxes[0].width - 4 / 3)).toBeLessThan(
          0.03,
        );
        const search = await page.locator('.library-search-row').boundingBox();
        expect(search.x + search.width).toBeLessThanOrEqual(width);
        await page.screenshot({ path: info.outputPath('library.png') });
        await page
          .getByRole('button', { name: '编辑记录', exact: true })
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
  test(`编辑恢复、删除和筛选 ${kind}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const state = await library(page, kind);
    await page
      .getByRole('button', { name: '编辑记录', exact: true })
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
    expect(state.writes.at(-1).body.doubanSubjectId).toBe(
      '9223372036854775806',
    );
    expect(state.writes.at(-1).body.id).toBe(id);
    await page
      .getByRole('button', { name: '编辑记录', exact: true })
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
    await expect(page.locator('.library-card')).toHaveCount(8);
    expect(state.writes.at(-1).method).toBe('DELETE');
    const base = kind === 'movie' ? '/movie/page' : '/read-record/page';
    await page.locator('.library-search-input input').fill('模拟搜索');
    const search = page.waitForRequest(
      (r) =>
        r.url().includes(base) &&
        new URL(r.url()).searchParams.get('title') === '模拟搜索',
    );
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await search;
    await page.locator('uni-picker[aria-label="状态"]').click();
    await page.waitForTimeout(400);
    const indicator = await page
      .locator('.uni-picker-view-indicator')
      .boundingBox();
    const x = indicator.x + indicator.width / 2;
    const y = indicator.y + indicator.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - (indicator.height * 2 * step) / 8 }],
      });
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(200);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(400);
    await Promise.all([
      page.waitForRequest(
        (r) =>
          r.url().includes(base) &&
          new URL(r.url()).searchParams.get('status') === 'in_progress',
      ),
      page.locator('.uni-picker-action-confirm:visible').click(),
    ]);
    await expect(page.locator('uni-picker[aria-label="状态"]')).toContainText(
      kind === 'movie' ? '在看' : '在读',
    );
    await cdp.detach();
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
