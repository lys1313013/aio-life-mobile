const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const fs = require('node:fs');
const path = require('node:path');
const cover = fs.readFileSync(path.join(__dirname, '../../src/static/book.png'));

for (const width of [390, 768, 1280]) for (const colorScheme of ['light', 'dark']) {
  test(`媒体封面和进度 ${width} ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await setup(page);
    await page.route('**/fixture-cover.png', route => route.fulfill({ contentType: 'image/png', body: cover }));
    state.video = Array.from({ length: 8 }, (_, i) => ({
      ...state.video[0], id: String(i + 1), title: `模拟课程 ${i + 1}：从基础知识到完整项目实践`,
      duration: 48800, watchedDuration: 23850, cover: i % 3 ? 'http://127.0.0.1:5180/fixture-cover.png' : '',
      ownerName: '模拟课程讲师', currentEpisode: 40, episodes: 68,
      status: i === 0 ? 'completed' : 'in_progress',
    }));
    await page.route('**/api/b-video/getStatusCount', route => route.fulfill({ json: { code: 0, data: { completed: 1, in_progress: 7 } } }));
    await page.route('**/api/b-video/statistics', route => route.fulfill({ json: { code: 0, data: { studiedSeconds: 190800, totalSeconds: 390400, unstudiedSeconds: 199600 } } }));
    await page.goto('/#/pages/records/video');
    await expect(page.locator('.video-card')).toHaveCount(8);
    await expect(page.locator('.video-duration').first()).toHaveText('13:33:20');
    await expect(page.locator('.episode').nth(1)).toHaveText('100%');
    const boxes = await page.locator('.video-poster').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, height: r.height };
    }));
    expect(boxes.every(b => b.x >= 0 && b.right <= width)).toBe(true);
    expect(boxes[0].height / boxes[0].width).toBeCloseTo(0.625, 2);
    await page.screenshot({ path: info.outputPath('video.png') });
    await page.getByRole('button', { name: /^编辑视频：/ }).first().press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();

    const books = Array.from({ length: 8 }, (_, i) => ({
      bookId: `fixture-${i}`, title: `模拟书籍 ${i + 1}：长标题的阅读与思考`, author: '模拟作者',
      finishReading: i % 3 === 0 ? 1 : 0, cover: i % 3 ? 'http://127.0.0.1:5180/fixture-cover.png' : '',
    }));
    await page.route('**/api/weread/sync?**', route => route.fulfill({ json: { code: 0, data: {
      shelf: { books }, notebooks: { books: books.map((book, i) => ({ bookId: book.bookId, book, noteCount: 8, reviewCount: 2, readingProgress: i % 3 === 0 ? 100 : 45 })) },
      stats: { totalReadTime: 3600, readDays: 5, dayAverageReadTime: 720, readStat: [{ stat: '读完', counts: 3 }], readTimes: { '1788220800': 900, '1788825600': 1800, '1789430400': 2700 }, readLongest: books.slice(0, 3).map(book => ({ book, readTime: 1800 })) },
      lastSyncTime: '模拟同步时间',
    } } }));
    await page.goto('/#/pages/records/weread');
    await expect(page.locator('.dashboard-metric').first()).toContainText('1小时');
    await page.screenshot({ path: info.outputPath('weread-dashboard.png') });
    await page.getByRole('button', { name: '我的书架', exact: true }).click();
    await expect(page.locator('.weread-book-card')).toHaveCount(8);
    await expect(page.locator('.book-progress').first()).toHaveText('100%');
    await expect(page.locator('.book-status').first()).toHaveText('已读完');
    await page.screenshot({ path: info.outputPath('weread-shelf.png') });
    await page.getByRole('button', { name: /^书籍详情：/ }).nth(1).press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.detail-cover')).toBeVisible();
    await page.screenshot({ path: info.outputPath('weread-detail.png') });
    expect(errors).toEqual([]);
    expect(state.writes).toEqual([]);
  });
}
