const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const fs = require('node:fs');
const path = require('node:path');
const png = fs.readFileSync(path.join(__dirname, '../../src/static/book.png'));
const fileId = 'a'.repeat(32);
for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`内部视频封面 ${width} ${colorScheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    const state = await setup(page, test.info().project.use.baseURL);
    state.video[0].cover = 'https://i1.hdslb.com/bfs/archive/never-fetch.jpg';
    state.video[0].coverFileId = fileId;
    state.video[0].coverState = 'READY';
    let imageRequests = 0;
    const external = [];
    page.on('request', r => { if (/hdslb|weserv/.test(r.url())) external.push(r.url()); });
    await page.route('**/api/file/preview/' + fileId, r => {
      expect(r.request().headers().authorization).toMatch(/^Bearer /);
      imageRequests++;
      return r.fulfill({ contentType: 'image/png', body: png });
    });
    await page.goto('/#/pages/records/video');
    await expect(page.locator('.video-card')).toHaveCount(1);
    await expect.poll(() => page.locator('.video-cover-image img').evaluateAll(nodes => nodes.filter(n => n.complete && n.naturalWidth > 0).length)).toBe(1);
    expect(imageRequests).toBe(1); expect(external).toEqual([]);
    await page.screenshot({ path: info.outputPath('video-cover.png') });
  });
}
test('导入状态更新与失败重试不打开编辑弹窗', async ({ page }) => {
  const state = await setup(page, test.info().project.use.baseURL);
  state.video[0].coverState = 'FAILED';
  state.video[0].coverFileId = null;
  let retries = 0, polls = 0;
  await page.route('**/api/b-video/*/cover/retry', r => { retries++; return r.fulfill({ json: { code: 0, data: null } }); });
  await page.route('**/api/b-video/covers?**', r => { polls++; return r.fulfill({ json: { code: 0, data: [{ id: state.video[0].id, coverState: 'READY', coverFileId: fileId }] } }); });
  await page.route('**/api/file/preview/' + fileId, r => r.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/#/pages/records/video');
  await page.getByRole('button', { name: '重试封面', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.locator('.video-cover-image img').evaluateAll(nodes => nodes.filter(n => n.complete && n.naturalWidth > 0).length), { timeout: 12000 }).toBe(1);
  expect(retries).toBe(1); expect(polls).toBe(1);
});
