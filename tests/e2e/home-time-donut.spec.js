const { test, expect } = require('./support/test');
const { homeCardFixture } = require('./home-card-fixture');
const { dismissModal } = require('./modal');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const imageRenderer = process.env.AIO_TEST_TIME_DONUT_IMAGE === '1';
const surfaceSelector = imageRenderer ? '.time-date-active .time-donut-image img' : '.time-date-active .time-donut-canvas canvas';
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
    '/message/unread-count': { count: 0 },
    '/auth/secondary-lock/menus': [], '/menu/all': [],
    '/menu/visuals': { menus: [], cards: {} },
    '/quick-nav/candidates': [], '/quick-nav/my': [], '/dashboard/tasks': [],
    '/home/cards': homeCardFixture().map(item => ({ ...item, isEnabled: Number(item.cardKey === 'section.time') })),
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
  await expect(page.locator('.time-date-active .donut-total')).toHaveText('19h6m');
  return fixtures;
}

async function expectRingAligned(page) {
  await expect.poll(() => page.locator('.time-date-active .donut').evaluate(node => {
    const chart = node.getBoundingClientRect();
    const canvas = node.querySelector('.time-donut-canvas canvas, .time-donut-image img').getBoundingClientRect();
    const total = node.querySelector('.donut-total').getBoundingClientRect();
    return Math.max(Math.abs(canvas.x - chart.x), Math.abs(canvas.y - chart.y),
      Math.abs(canvas.width - chart.width), Math.abs(canvas.height - chart.height),
      Math.abs(total.x + total.width / 2 - chart.x - chart.width / 2),
      Math.abs(total.y + total.height / 2 - chart.y - chart.height / 2));
  })).toBeLessThan(1);
}

async function ringPixels(surface, empty = false) {
  return surface.evaluate(async (node, { groups, rotation, empty }) => {
    let canvas = node;
    if (node.tagName === 'IMG') {
      await node.decode();
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 352;
      canvas.getContext('2d').drawImage(node, 0, 0, 352, 352);
    }
    const ctx = canvas.getContext('2d'), scale = canvas.width / 176;
    if (empty) return [...ctx.getImageData(Math.floor(132.5 * scale), Math.floor(88 * scale), 1, 1).data];
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
  }, { groups, rotation: await donutRotation, empty });
}

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页时迹加号可新增保存并再次编辑 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let saved = null;
    let fixtures;
    apiMock({
      'GET /api/timeRecord/recommendNext': { json: { code: 0, message: null, data: {
        records: [], recommend: { categoryId: '0', startTime: 1200, endTime: 1259 },
      } } },
      'GET /api/timeRecord/relateTypes': { json: { code: 0, message: null, data: [] } },
      'GET /api/userDictType/getByDictType': { json: { code: 0, message: null, data: { dictDetailList: [] } } },
      'POST /api/timeRecord': request => {
        saved = { ...request.postDataJSON(), id: 'added-fixture' };
        fixtures['/timeRecord/query'].push(saved);
        return { json: { code: 0, message: null, data: saved.id } };
      },
      'GET /api/timeRecord/added-fixture': () => ({ json: { code: 0, message: null, data: saved } }),
    });
    fixtures = await setup(page);
    const add = page.getByRole('button', { name: '新增时迹', exact: true });
    await add.click();
    const editor = page.getByRole('dialog', { name: '记录时间', exact: true });
    await expect(editor.locator('.compact-fields')).toBeVisible();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.time-date-active .donut-total')).toHaveText('20h6m');
    expect(saved).toMatchObject({ categoryId: '0', startTime: 1200, endTime: 1259 });
    // 新记录排在最前；验证修正引用后，内容区编辑与页头新增都可继续使用。
    await page.locator('.time-date-active').getByRole('button', { name: '编辑时迹 休息', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: '编辑时迹', exact: true }).locator('.compact-fields')).toBeVisible();
    await dismissModal(page);
    await add.click();
    await expect(editor.locator('.compact-fields')).toBeVisible();
    await dismissModal(page);
    expect(errors).toEqual([]);
  });

  if (imageRenderer) test(`微信首页目标进度环比例正确且随卡片滚动 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 300 });
    await page.emulateMedia({ colorScheme: theme });
    const percents = [0, 25, 87, 100];
    await setup(page, {
      '/home/cards': homeCardFixture().map(item => ({ ...item, isEnabled: Number(['section.time', 'section.goal'].includes(item.cardKey)) })),
      '/quick-nav/candidates': [{ path: '/task-center/goal' }],
      '/goals': percents.map((percent, index) => ({ id: String(index), title: '模拟目标 ' + index,
        type: 1, status: 'in_progress', isPinned: 1, targetValue: 100, currentValue: percent })),
    });
    const rings = page.locator('.goal-progress');
    await expect(rings).toHaveCount(4);
    await expect(page.locator('.goal-progress canvas')).toHaveCount(0);
    for (let index = 0; index < percents.length; index++) {
      const ring = rings.nth(index);
      await expect(ring.locator('.goal-progress-value')).toHaveText(percents[index] + '%');
      const count = await ring.locator('img').evaluate(async image => {
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 112;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 112, 112);
        let painted = 0;
        for (let step = 0; step < 360; step++) {
          const angle = -Math.PI / 2 + (step + 0.5) * Math.PI / 180;
          if (ctx.getImageData(Math.floor((28 + Math.cos(angle) * 25) * 2),
            Math.floor((28 + Math.sin(angle) * 25) * 2), 1, 1).data[3] > 128) painted++;
        }
        return painted;
      });
      expect(Math.abs(count - percents[index] * 3.6)).toBeLessThan(12);
    }
    const scroller = page.locator('.dashboard-scroll > .uni-scroll-view > .uni-scroll-view');
    await scroller.evaluate(node => { node.scrollTop = 120; });
    await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    for (const ring of await rings.all()) {
      const chart = await ring.boundingBox(), image = await ring.locator('img').boundingBox();
      expect(Math.abs(chart.x - image.x) + Math.abs(chart.y - image.y)).toBeLessThan(1);
    }
    await page.screenshot({ path: info.outputPath('goal-rings-after-scroll.png') });
  });

  if (imageRenderer) test(`微信时迹图片被弹窗正常覆盖且加载失败可恢复 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, {
      '/timeRecord/recommendNext': { records: [], recommend: { categoryId: '0', startTime: 1200, endTime: 1259 } },
      '/timeRecord/relateTypes': [], '/userDictType/getByDictType': { dictDetailList: [] },
    });
    const image = page.locator(surfaceSelector);
    await expect.poll(() => ringPixels(image)).toEqual({ wrong: 0, gaps: 0 });
    const before = await page.locator('.time-donut-renderer').boundingBox();
    await page.getByRole('button', { name: '新增时迹', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '记录时间', exact: true }).locator('.compact-fields')).toBeVisible();
    // 图像和普通文字一起处于遮罩下，不需要打开弹窗时销毁原生画布。
    await expect(image).toHaveCount(1);
    await expect(page.locator('.time-donut-renderer canvas')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('image-under-modal.png') });
    await dismissModal(page);
    await expectRingAligned(page);
    // 模拟框架 image 的解码失败回调，再验证重试会真实重建并加载图像。
    await page.locator('.time-donut-image').evaluate(node => {
      node.__vueParentComponent.emit('error', { detail: { errMsg: '模拟图片解码失败' } });
    });
    await page.locator('.time-donut-retry').click();
    await expect.poll(() => ringPixels(image)).toEqual({ wrong: 0, gaps: 0 });
    await expect(page.locator('.time-donut-retry')).toHaveCount(0);
    expect(await page.locator('.time-donut-renderer').boundingBox()).toEqual(before);
  });

  test(`首页时迹圆环连续且小分类比例正确 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    // 离页进入“我”也必须完整模拟，未声明接口由严格 mock 拦截，避免请求真实后端。
    apiMock({});
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const fixtures = await setup(page);
    const canvas = page.locator(surfaceSelector);
    if (imageRenderer) await expect(page.locator('.time-donut-renderer canvas')).toHaveCount(0);
    await expectRingAligned(page);
    await expect.poll(() => ringPixels(canvas)).toEqual({ wrong: 0, gaps: 0 });
    await expectRingAligned(page);
    await page.locator('.time-date-active .donut').screenshot({ path: info.outputPath('donut.png') });
    await expect(page.locator('.time-date-active .donut-label')).toHaveCount(4);
    await expect(page.locator('.time-date-active .donut-label-left')).toHaveCount(2);
    await expect(page.locator('.time-date-active .donut-label-right')).toHaveCount(2);
    await expect(page.locator('.time-donut-retry')).toHaveCount(0);
    // 离页再返回不残留半环；随后空态使用同一几何和主题。
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
    await expect.poll(() => ringPixels(canvas)).toEqual({ wrong: 0, gaps: 0 });
    fixtures['/timeRecord/query'].splice(0);
    await page.reload();
    await expect(page.locator('.time-date-active .empty-label')).toContainText('今日暂无记录');
    await expect(page.locator('.time-date-active .donut-label')).toHaveCount(0);
    await expect.poll(() => ringPixels(canvas, true)).toEqual(theme === 'dark' ? [69, 71, 77, 255] : [201, 201, 204, 255]);
    expect(errors).toEqual([]);
  });

  test(`时迹圆环滚动和卡片重排后仍与总时长对齐 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 300 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    let cards = homeCardFixture().map(item => ({ ...item, isEnabled: Number(['section.time', 'section.links', 'section.thoughts'].includes(item.cardKey)) }));
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
    await page.screenshot({ path: info.outputPath('after-scroll.png') });
    await scroller.evaluate(node => { node.scrollTop = 0; });
    await page.locator('[data-card-key="section.time"]').press('Alt+ArrowDown');
    await expect.poll(() => page.locator('.home-order-section:visible').evaluateAll(nodes => nodes.map(node => node.dataset.cardKey))).toEqual(['section.links', 'section.time', 'section.thoughts']);
    await expectRingAligned(page);
    await page.locator('.time-date-active .donut').scrollIntoViewIfNeeded();
    await page.locator('.time-date-active .donut').screenshot({ path: info.outputPath('donut-after-reorder.png') });
  });
}


test.describe('首页时迹日期横滑', () => {
  test.use({ hasTouch: true });

  async function swipe(page, dx, dy = 0, cancel = false, checkFollow = false) {
    const surface = page.locator('.time-date-active');
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    const x = box.x + (dx < 0 ? box.width * 0.8 : box.width * 0.2);
    const y = box.y + box.height / 2;
    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }],
        });
        // 控制手势速度，让原生 swiper 识别拖动而非快速甩动。
        await page.waitForTimeout(20);
        if (checkFollow && step === 3) {
          const dragged = await surface.boundingBox();
          expect(Math.abs(dragged.x - box.x - dx / 2)).toBeLessThan(12);
          const previous = await page.locator('.time-date-page').first().boundingBox();
          expect(previous.x + previous.width).toBeGreaterThan(box.x);
        }
      }
      await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      // 同时覆盖不翻页的负向手势，等待原生 360ms 吸附动画结束。
      await page.waitForTimeout(450);
    } finally { await client.detach(); }
  }

  for (const [today, previous] of [['2026-03-01', '2026-02-28'], ['2026-01-01', '2025-12-31']]) {
    test(`右滑前一天、左滑回今天，跨月跨年及失败恢复 ${today}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.clock.install({ time: new Date(today + 'T12:00:00') });
      await setup(page);
      const dates = [];
      let fail = false;
      await page.route('**/api/timeRecord/query?*', route => {
        const date = new URL(route.request().url()).searchParams.get('date');
        dates.push(date);
        return route.fulfill({ json: fail
          ? { code: 1, message: '模拟日期加载失败' }
          : { code: 0, data: date === today ? [{ id: 'today-row', categoryId: '0', startTime: 0, endTime: 59 }] : [] } });
      });
      const title = page.locator('[data-card-key="section.time"] .section-title');
      const dateCaption = page.locator('[data-card-key="section.time"] .section-caption');
      // 明细上的右滑不能误开编辑；纵向、短滑及取消均不切换日期。
      await swipe(page, -20);
      await swipe(page, -5, -60);
      await swipe(page, 120, 0, true);
      await swipe(page, -120);
      expect(dates).toEqual([]);
      await swipe(page, 120, 0, false, true);
      await expect(title).toHaveText('时迹');
      await expect(dateCaption).toHaveText(previous);
      await expect(page.locator('.time-date-active .empty-label')).toHaveText(previous + '暂无记录');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(dates).toEqual([previous]);

      // 新增沿用卡片日期，并只获取该日的推荐时段。
      let recommendedDate = '';
      await page.route('**/api/timeRecord/recommendNext?*', route => {
        recommendedDate = new URL(route.request().url()).searchParams.get('date');
        return route.fulfill({ json: { code: 0, data: { records: [], recommend: { categoryId: '0', startTime: 600, endTime: 659 } } } });
      });
      await page.route('**/api/timeRecord/relateTypes', route => route.fulfill({ json: { code: 0, data: [] } }));
      await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: { dictDetailList: [] } } }));
      await page.getByRole('button', { name: '新增时迹', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '记录时间', exact: true });
      await editor.getByRole('button', { name: '记录日期', exact: true }).click();
      await expect(page.getByRole('dialog', { name: /日历$/ }).getByRole('button', { name: previous, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await dismissModal(page);
      await expect(editor.locator('.compact-fields')).toBeVisible();
      expect(recommendedDate).toBe(previous);
      await dismissModal(page);

      // 每分钟时钟及卡片刷新均保留历史日期。
      await page.clock.fastForward(61000);
      await expect(dateCaption).toHaveText(previous);
      await page.getByRole('button', { name: '刷新时迹 ' + previous, exact: true }).press('Enter');
      await expect.poll(() => dates.length).toBe(2);
      expect(dates.at(-1)).toBe(previous);

      fail = true;
      await swipe(page, -120);
      await expect(page.getByRole('button', { name: '时迹更新失败，点击重试' })).toBeVisible();
      await expect(dateCaption).toHaveText(previous);
      fail = false;
      await page.getByRole('button', { name: '时迹更新失败，点击重试' }).click();
      await expect(title).toHaveText('时迹');
      await expect(dateCaption).toHaveCount(0);
      await expect(page.locator('.time-date-active .donut-total')).toHaveText('1h');
      expect(dates.slice(-2)).toEqual([today, today]);
      if (imageRenderer) {
        const image = page.locator(surfaceSelector);
        await expect(image).toBeVisible();
        // 滑动复位后检查真实图像像素，不能只检查总时长文字。
        await expect.poll(() => image.evaluate(async node => {
          await node.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 176;
          const context = canvas.getContext('2d'); context.drawImage(node, 0, 0);
          return [...context.getImageData(132, 88, 1, 1).data];
        })).toEqual([250, 173, 20, 255]);
        await page.locator('.time-date-active .donut').screenshot({ path: info.outputPath('donut-after-date-swipe.png') });
      }
      const count = dates.length;
      await swipe(page, -120);
      expect(dates).toHaveLength(count);

      // 桌面沿用设备页的鼠标拖动；拖出后松手不误开明细，再用触控板返回。
      const surface = page.locator('.time-date-active');
      const box = await surface.boundingBox();
      const x = box.x + box.width * 0.2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + box.width * 0.7, y, { steps: 8 });
      expect((await surface.boundingBox()).x - box.x).toBeGreaterThan(box.width * 0.5);
      await page.mouse.up();
      await expect(dateCaption).toHaveText(previous);
      await expect(page.locator('.time-date-active')).toHaveAttribute('data-date', previous);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '新增时迹', exact: true })).toBeEnabled();
      // 等待页窗口复位后才开始下一次手势，不抢占吸附动画。
      await expect.poll(async () => Math.abs((await surface.boundingBox()).x - box.x)).toBeLessThan(1);
      await page.mouse.move(x, y);
      await page.mouse.wheel(100, 0);
      await expect(dateCaption).toHaveCount(0);
      await expect(page.locator('.time-date-active .donut-total')).toHaveText('1h');
    });
  }
});
