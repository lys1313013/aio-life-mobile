const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const formatSource = readFileSync(resolve(__dirname, '../../src/services/dashboard-format.ts'), 'utf8');
const donutRotation = import(`data:text/javascript;base64,${Buffer.from(formatSource).toString('base64')}`)
  .then(({ summaryDonutRotation }) => summaryDonutRotation(groups.map((group, index) => ({ ...group, id: String(index) }))));

// 与问题截图相同的六分类比例，尤其覆盖聚集在左上角的小扇区。
const groups = [
  { name: '休息', minutes: 476, color: '#faad14' },
  { name: '项目', minutes: 437, color: '#722ed1' },
  { name: '吃饭', minutes: 145, color: '#fa8c16' },
  { name: '娱乐', minutes: 62, color: '#eb2f96' },
  { name: '交通', minutes: 15, color: '#2f54eb' },
  { name: '卫生', minutes: 11, color: '#13c2c2' },
];
async function setup(page, extra = {}) {
  let minute = 0;
  const fixtures = {
    '/user/info': { id: 'donut-fixture', nickname: '模拟用户' },
    '/auth/secondary-lock/menus': [], '/menu/all': [],
    '/menu/visuals': { menus: [], cards: {} },
    '/quick-nav/candidates': [], '/quick-nav/my': [], '/dashboard/tasks': [],
    '/home/cards': homeCardFixture().map(item => ({ ...item, enabled: item.cardKey === 'section.time' })),
    '/timeTrackerCategory/list': groups.map((item, index) => ({ ...item, id: String(index) })),
    '/timeRecord/query': groups.map((item, index) => {
      const startTime = minute; minute += item.minutes;
      return { id: String(index), categoryId: String(index), startTime, endTime: minute - 1 };
    }),
    ...extra,
  };
  for (const [path, data] of Object.entries(fixtures)) {
    const handler = route => route.fulfill({ json: { code: 0, data } });
    await page.route('**/api' + path, handler);
    await page.route('**/api' + path + '?*', handler);
  }
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'donut-fixture' })));
  await page.goto('/#/pages/home/index');
  await expect(page.locator('.donut-total')).toHaveText('19h6m');
  return fixtures;
}

async function expectRingAligned(page) {
  await expect.poll(() => page.locator('.donut').evaluate(node => {
    const chart = node.getBoundingClientRect();
    const canvas = node.querySelector('.time-donut-canvas canvas').getBoundingClientRect();
    const total = node.querySelector('.donut-total').getBoundingClientRect();
    return Math.max(Math.abs(canvas.x - chart.x), Math.abs(canvas.y - chart.y),
      Math.abs(canvas.width - chart.width), Math.abs(canvas.height - chart.height),
      Math.abs(total.x + total.width / 2 - chart.x - chart.width / 2),
      Math.abs(total.y + total.height / 2 - chart.y - chart.height / 2));
  })).toBeLessThan(1);
}

async function ringPixels(canvas) {
  return canvas.evaluate((node, { groups, rotation }) => {
    const ctx = node.getContext('2d'), scale = node.width / 176;
    const total = groups.reduce((sum, row) => sum + row.minutes, 0);
    let start = -Math.PI / 2 + rotation, wrong = 0, gaps = 0;
    for (const group of groups) {
      const end = start + group.minutes / total * Math.PI * 2;
      // 小扇区仅数像素宽，检查中点以避开边缘抗锯齿；主要分类检查多个内部像素。
      const samples = group.minutes < 30 ? [0.5] : [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
      for (const sample of samples) {
        const angle = start + (end - start) * sample;
        const pixel = ctx.getImageData(Math.floor((88 + Math.cos(angle) * 44.5) * scale), Math.floor((88 + Math.sin(angle) * 44.5) * scale), 1, 1).data;
        const hex = '#' + [...pixel].slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('');
        if (hex !== group.color) wrong++;
      }
      start = end;
    }
    for (let sample = 0; sample < 1440; sample++) {
      const angle = sample / 1440 * Math.PI * 2;
      const pixel = ctx.getImageData(Math.floor((88 + Math.cos(angle) * 44.5) * scale), Math.floor((88 + Math.sin(angle) * 44.5) * scale), 1, 1).data;
      if (pixel[3] < 254) gaps++;
    }
    return { wrong, gaps };
  }, { groups, rotation: await donutRotation });
}

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页时迹圆环连续且小分类比例正确 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const fixtures = await setup(page);
    const canvas = page.locator('.time-donut-canvas canvas');
    await expectRingAligned(page);
    await expect.poll(() => ringPixels(canvas)).toEqual({ wrong: 0, gaps: 0 });
    await expectRingAligned(page);
    await page.locator('.donut').screenshot({ path: info.outputPath('donut.png') });
    await expect(page.locator('.donut-label')).toHaveCount(4);
    await expect(page.locator('.donut-label-left')).toHaveCount(2);
    await expect(page.locator('.donut-label-right')).toHaveCount(2);
    await expect(page.locator('.time-donut-retry')).toHaveCount(0);
    // 离页再返回不残留半环；随后空态使用同一几何和主题。
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
    await expect.poll(() => ringPixels(canvas)).toEqual({ wrong: 0, gaps: 0 });
    fixtures['/timeRecord/query'].splice(0);
    await page.reload();
    await expect(page.locator('.empty-label')).toContainText('今日暂无记录');
    await expect(page.locator('.donut-label')).toHaveCount(0);
    await expect.poll(() => canvas.evaluate(node => {
      const scale = node.width / 176;
      return [...node.getContext('2d').getImageData(Math.floor(132.5 * scale), Math.floor(88 * scale), 1, 1).data];
    })).toEqual(theme === 'dark' ? [69, 71, 77, 255] : [201, 201, 204, 255]);
    expect(errors).toEqual([]);
  });

  test(`时迹圆环滚动和卡片重排后仍与总时长对齐 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 300 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    let cards = homeCardFixture().map(item => ({ ...item, enabled: ['section.time', 'section.links', 'section.thoughts'].includes(item.cardKey) }));
    await page.route('**/api/home/cards/order', route => {
      const { keys } = route.request().postDataJSON();
      cards = cards.map(item => item.group === 'section' ? { ...item, sortOrder: keys.indexOf(item.cardKey) } : item)
        .sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder);
      return route.fulfill({ json: { code: 0, data: cards } });
    });
    await setup(page, {
      '/home/cards': cards,
      '/taskDetails/watched': [],
      '/thought/dashboard': [{ id: 'layout-thought', content: '用于检查滚动和重排后的圆环位置', createTime: '2026-10-06 10:00' }],
    });
    const scroller = page.locator('.dashboard-scroll > .uni-scroll-view > .uni-scroll-view');
    await scroller.evaluate(node => { node.scrollTop = 100; });
    await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expectRingAligned(page);
    await scroller.evaluate(node => { node.scrollTop = 0; });
    await page.locator('[data-card-key="section.time"]').press('Alt+ArrowDown');
    await expect.poll(() => page.locator('.home-order-section:visible').evaluateAll(nodes => nodes.map(node => node.dataset.cardKey))).toEqual(['section.links', 'section.time', 'section.thoughts']);
    await expectRingAligned(page);
    await page.locator('.donut').scrollIntoViewIfNeeded();
    await page.locator('.donut').screenshot({ path: info.outputPath('donut-after-reorder.png') });
  });
}
