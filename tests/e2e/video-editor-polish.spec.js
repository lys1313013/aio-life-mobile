const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const path = require('node:path');

async function openVideo(page) {
  const state = await setup(page);
  Object.assign(state.video[0], {
    title: '模拟长标题课程：从设计原则到完整项目实践与复盘',
    ownerName: '模拟课程讲师',
    cover: 'https://example.invalid/video-cover.png',
    description: '模拟简介，包含课程内容、练习安排和后续学习建议。'.repeat(8),
    lastWatched: '2026-10-20 20:30:00',
  });
  await page.goto('/#/pages/records/video');
  await page.getByRole('button', { name: /^编辑视频：/ }).first().click();
  await expect(page.getByRole('dialog', { name: '编辑学习视频' })).toBeVisible();
  return state;
}

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`视频编辑精简和展开布局 ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openVideo(page);
    await expect(page.locator('input[aria-label="封面链接"]')).toHaveCount(0);
    await expect(page.locator('input[aria-label="当前集数"]')).toHaveValue('1');
    const save = page.getByRole('button', { name: '保存', exact: true });
    await expect(save).toBeInViewport();
    const dialog = page.getByRole('dialog', { name: '编辑学习视频' });
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: path.resolve(`artifacts/ui-polish-20261022/video-${width}-${colorScheme}-compact.png`) });
    await page.getByRole('button', { name: '更多信息', exact: true }).click();
    await expect(page.locator('input[aria-label="封面链接"]')).toHaveValue('https://example.invalid/video-cover.png');
    await page.screenshot({ path: path.resolve(`artifacts/ui-polish-20261022/video-${width}-${colorScheme}-expanded.png`) });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await page.screenshot({ path: path.resolve(`artifacts/ui-polish-20261022/video-${width}-${colorScheme}-expanded-footer.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('视频更新集数保留折叠数据，保存失败可重试', async ({ page }) => {
  const state = await openVideo(page);
  const original = { ...state.video[0] };
  await page.locator('input[aria-label="当前集数"]').fill('2');
  await expect(page.locator('input[aria-label="已学习时长（秒）"]')).toHaveValue('50');
  state.fail = true;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('模拟保存失败');
  await expect(page.locator('input[aria-label="当前集数"]')).toHaveValue('2');
  await page.getByRole('button', { name: '更多信息', exact: true }).click();
  await expect(page.locator('input[aria-label="UP主"]')).toHaveValue(original.ownerName);
  await expect(page.locator('.form-field').filter({ hasText: '最近观看日期' })).toContainText('2026-10-20');
  await expect(page.locator('.form-field').filter({ hasText: '最近观看时间' })).toContainText('20:30');
  state.fail = false;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^编辑视频：/ }).first().click();
  await expect(page.getByRole('button', { name: '更多信息', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('input[aria-label="封面链接"]')).toHaveCount(0);
  const writes = state.writes.filter(write => write.path.startsWith('/api/b-video/'));
  expect(writes).toHaveLength(2);
  expect(writes[1].path).toBe('/api/b-video/' + original.id);
  expect(writes[1].body).toMatchObject({ currentEpisode: 2, watchedDuration: 50,
    cover: original.cover, ownerName: original.ownerName,
    description: original.description, pagesInfo: original.pagesInfo,
    duration: original.duration, episodes: original.episodes,
  });
});

test('视频手动创建可修正折叠的总时长并提交', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/#/pages/records/video?create=1');
  await expect(page.getByRole('dialog', { name: '编辑学习视频' })).toBeVisible();
  await page.locator('input[aria-label="视频链接"]').fill('https://www.bilibili.com/video/BV1234567890');
  await page.locator('input[aria-label="标题"]').fill('模拟手动录入课程');
  await page.locator('input[aria-label="已学习时长（秒）"]').fill('20');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('请检查时长与当前集数范围');
  await expect(page.locator('input[aria-label="总时长（秒）"]')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.locator('input[aria-label="总时长（秒）"]').fill('120');
  await page.getByRole('button', { name: '收起更多信息', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.writes.find(write => write.path === '/api/b-video').body).toMatchObject({ duration: 120, watchedDuration: 20, title: '模拟手动录入课程' });
});

test('视频解析失败保留输入并允许重新解析', async ({ page }) => {
  await openVideo(page);
  let failed = true;
  await page.route('https://api.bilibili.com/x/web-interface/view?**', async route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    const result = failed ? { code: -1, message: '模拟解析失败' } : { code: 0, data: {
      title: '模拟解析结果', bvid: 'BV1234567890', aid: '123', videos: 2, duration: 100,
      pic: 'https://example.invalid/parsed-cover.png', owner: { name: '模拟解析UP主' },
      desc: '模拟解析简介', pages: [{ page: 1, duration: 50 }, { page: 2, duration: 50 }],
    } };
    await route.fulfill({ contentType: 'application/javascript', body: `${callback}(${JSON.stringify(result)})` });
  });
  await page.getByRole('button', { name: '解析视频', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('模拟解析失败');
  await expect(page.locator('input[aria-label="标题"]')).toHaveValue('模拟长标题课程：从设计原则到完整项目实践与复盘');
  await expect(page.locator('input[aria-label="UP主"]')).toHaveValue('模拟课程讲师');
  failed = false;
  await page.getByRole('button', { name: '解析视频', exact: true }).click();
  await expect(page.locator('input[aria-label="标题"]')).toHaveValue('模拟解析结果');
  await expect(page.locator('input[aria-label="UP主"]')).toHaveValue('模拟解析UP主');
  await expect(page.locator('textarea[aria-label="学习笔记"]')).toHaveValue('模拟笔记');
});
