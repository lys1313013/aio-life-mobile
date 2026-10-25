const { selectCalendarDate } = require('./calendar');
const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const { pullDown } = require('./gestures');

test.use({ hasTouch: true });

async function swipeRecord(page, row, dx, dy = 0) {
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  const x = box.x + box.width * 0.65, y = box.y + Math.min(box.height / 2, 30);
  const client = await page.context().newCDPSession(page);
  const touch = (x, y) => [{ x, y }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(x, y) });
  for (const fraction of [0.2, 0.5, 1]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(x + dx * fraction, y + dy * fraction) });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

function records(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(9223372036854000000n + BigInt(index)),
    exerciseTypeId: String(81 + index % 16),
    exerciseDate: new Date(Date.UTC(2026, 9, 19 - Math.floor(index / 16))).toISOString().slice(0, 10),
    exerciseCount: 1, description: `模拟运动记录${index}，包含备注并保留编辑入口`,
  }));
}

async function prepare(page, count, holds = {}) {
  await setup(page);
  const data = records(count), calls = [], statisticsCalls = [], state = { fail: false, failPage: 0 };
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: {
    code: 0, data: { dictDetailList: Array.from({ length: 16 }, (_, i) => ({ id: String(81 + i), dictLabel: `模拟运动${i}`, icon: 'mdi:run' })) },
  } }));
  await page.route('**/api/exerciseRecord/query?*', async route => {
    const url = new URL(route.request().url()), number = Number(url.searchParams.get('page'));
    calls.push(number);
    if (number === 2 && holds.page) await holds.page;
    if (state.fail || state.failPage === number) return route.fulfill({ json: { code: 1, message: '模拟刷新失败' } });
    const selected = filterRecords(data, url);
    const size = Number(url.searchParams.get('pageSize'));
    await route.fulfill({ json: { code: 0, data: { items: selected.slice((number - 1) * size, number * size), total: selected.length } } });
  });
  await page.route('**/api/exerciseRecord/statistics/summary?*', async route => {
    const url = new URL(route.request().url());
    statisticsCalls.push(url.search);
    if (holds.statistics && !url.searchParams.get('exerciseTypeId')) await holds.statistics;
    if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟刷新失败' } });
    const groups = new Map();
    for (const row of filterRecords(data, url)) {
      const key = row.exerciseDate + '_' + row.exerciseTypeId;
      if (!groups.has(key)) groups.set(key, { exerciseDate: row.exerciseDate, exerciseTypeId: row.exerciseTypeId, exerciseCount: 0, recordCount: 0 });
      const group = groups.get(key);
      group.exerciseCount += row.exerciseCount || 0;
      group.recordCount++;
    }
    await route.fulfill({ json: { code: 0, data: [...groups.values()] } });
  });
  return { data, calls, statisticsCalls, state };
}
function filterRecords(data, url) {
  const type = url.searchParams.get('exerciseTypeId'), start = url.searchParams.get('startDate'), end = url.searchParams.get('endDate');
  return data.filter(row => (!type || row.exerciseTypeId === type) && (!start || row.exerciseDate >= start) && (!end || row.exerciseDate <= end));
}

async function bottom(page) {
  await page.locator('.mobile-page-scroll').hover();
  // 等待 uni-h5 的 200ms 触底事件节流，然后发送真实滚轮输入。
  await page.waitForTimeout(220);
  await page.mouse.wheel(0, 100000);
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`运动首屏独立统计与按需分页 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const { calls } = await prepare(page, 603, { statistics: pending });
    await page.goto('/#/pages/records/exercise');
    // 统计尚未返回时，首屏明细已可见，且只查询一页。
    await expect(page.locator('.record-header')).toHaveCount(20);
    await expect(page.locator('.metric-placeholder')).toHaveCount(2);
    expect(calls).toEqual([1]);
    const geometry = () => page.locator('.aio-chart, .record-toolbar').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { top: box.top, height: box.height };
    }));
    const before = await geometry();
    await page.screenshot({ path: info.outputPath('first-page-loading.png') });
    release();
    const total = page.locator('.metric-card').filter({ has: page.getByText('记录', { exact: true }) });
    await expect(total.locator('.metric-number')).toHaveText('603');
    expect(calls).toEqual([1]);
    const after = await geometry();
    expect(after).toHaveLength(before.length);
    after.forEach((box, index) => {
      expect(Math.abs(box.height - before[index].height)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.top - before[index].top)).toBeLessThanOrEqual(1);
    });
    await expect(page.locator('.record-header')).toHaveCount(20);
    await expect(page.locator('.aio-chart')).toHaveCount(3);
    await expect(page.getByRole('figure', { name: '每日运动量', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('loaded.png') });
    await page.locator('uni-picker[aria-label="每日运动量类型"]').scrollIntoViewIfNeeded();
    await page.getByRole('figure', { name: '每日运动量', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('daily-selected.png') });
    await bottom(page);
    await expect(page.locator('.record-header')).toHaveCount(40);
    const dates = await page.locator('.record-date').allTextContents();
    expect(dates[0]).toBe('2026-10-19');
    expect(await page.locator('.record-description').allTextContents()).toEqual(
      Array.from({ length: 40 }, (_, i) => `模拟运动记录${i}，包含备注并保留编辑入口`),
    );
    expect(calls).toEqual([1, 2]);
    await expect(page.getByRole('button', { name: /继续加载|加载更多|下一页/ })).toHaveCount(0);
  });
}

test('运动列表末批停止、日期筛选重置批次、刷新失败保留已显示记录', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+08:00'));
  const { calls, state } = await prepare(page, 45);
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-header')).toHaveCount(20);
  await bottom(page); await expect(page.locator('.record-header')).toHaveCount(40);
  await bottom(page); await expect(page.locator('.record-header')).toHaveCount(45);
  await bottom(page); await expect(page.locator('.record-header')).toHaveCount(45);
  expect(calls).toEqual([1, 2, 3]);
  state.fail = true;
  await pullDown(page, '.mobile-page-scroll');
  await expect(page.getByRole('alert').first()).toContainText('模拟刷新失败');
  await expect(page.locator('.record-header')).toHaveCount(45);
  state.fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).last().click();
  await expect(page.locator('.record-header')).toHaveCount(20);
  const startPicker = page.locator('.calendar-trigger[aria-label="开始日期"]');
  await selectCalendarDate(page, startPicker, '2026-10-19');
  await expect(page.locator('.record-header')).toHaveCount(16);
  await page.getByRole('button', { name: '清除日期筛选', exact: true }).click();
  await expect(page.locator('.record-header')).toHaveCount(20);
});

test('每日统计默认最近类型，仅可切换具体类型和无记录类型', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const { data, calls } = await prepare(page, 2);
  data.reverse(); // 最近一条属于第二个字典类型，不能误选字典的第一项。
  await page.goto('/#/pages/records/exercise');
  await expect(page.getByRole('figure', { name: '每日运动量', exact: true })).toBeVisible();
  for (const [label, value] of [['模拟运动0', '1'], ['模拟运动15', null]]) {
    await page.locator('uni-picker[aria-label="每日运动量类型"]').click();
    await expect(page.locator('.uni-picker-select:visible').getByText('全部类型', { exact: true })).toHaveCount(0);
    await page.locator('.uni-picker-select:visible').getByText(label, { exact: true }).click();
    const chart = page.getByRole('figure', { name: '每日运动量', exact: true });
    await expect(chart).toBeVisible();
    if (value) {
      await expect(chart.locator('.mini-chart-values')).toHaveCount(0);
      await expect(chart.locator('.chart-selected-label')).toHaveCount(0);
      await expect(chart.locator('.chart-extreme-label')).toHaveText([value]);
      await chart.getByRole('slider').press('ArrowRight');
      await expect(chart.getByRole('tooltip')).toContainText(label + ' ' + value);
      await expect(chart.getByRole('tooltip')).toContainText('2026-10-19');
    } else await expect(chart.getByText('暂无数据', { exact: true })).toBeVisible();
    await expect(page.locator('.aio-chart')).toHaveCount(3);
    await expect(page.locator('.record-header')).toHaveCount(2);
  }
  expect(calls).toEqual([1]);
});

test('切换筛选后迟到的统计不覆盖新结果，也不拉取历史明细', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { calls } = await prepare(page, 603, { statistics: pending });
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-header')).toHaveCount(20);
  await page.locator('uni-picker[aria-label="运动类型"]').click();
  await page.locator('.uni-picker-select:visible').getByText('模拟运动1', { exact: true }).click();
  const total = page.locator('.metric-card').filter({ has: page.getByText('记录', { exact: true }) });
  await expect(total.locator('.metric-number')).toHaveText('38');
  release();
  await expect(page.locator('.record-header')).toHaveCount(20);
  await expect(page.locator('.record-type .title')).toHaveText(Array(20).fill('模拟运动1'));
  expect(calls).toEqual([1, 1]);
});

// 模拟截图中的多日期、同日多条与长名称，覆盖新的多选入口及行内操作。
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`运动记录紧凑列表与多选 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const { data } = await prepare(page, 8);
    const labels = ['散步', '深蹲', '健腹轮', '正握引体向上', '自定义超长运动类型名称用于检查换行'];
    await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: {
      code: 0, data: { dictDetailList: labels.map((dictLabel, i) => ({ id: String(81 + i), dictLabel,
        icon: ['mdi:walk', 'mdi:weight-lifter', 'mdi:run', 'mdi:weight-lifter', 'mdi:run'][i],
        color: ['#91be38', '#a05bdd', '#2495e8', '#5778e9', '#d99536'][i] })) },
    } }));
    for (const [i, row] of data.entries()) Object.assign(row, {
      exerciseTypeId: String(81 + [0, 0, 1, 2, 2, 3, 3, 4][i]),
      exerciseDate: '2026-10-' + [19, 17, 15, 14, 14, 14, 14, 13][i],
      exerciseCount: [600, 256, 50, 50, 50, 3, 10, 123456][i],
      description: i === 7 ? '模拟备注：较长的说明也应自然换行，不遮挡运动数量和操作入口。' : '',
    });
    const deleted = [];
    await page.route('**/api/exerciseRecord/deleteBatch', async route => {
      deleted.push(route.request().postDataJSON());
      await route.fulfill({ json: { code: 0, data: true } });
    });
    await page.goto('/#/pages/records/exercise');
    await expect(page.locator('.record-header')).toHaveCount(8);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.locator('.record-date')).toHaveText(['2026-10-19', '2026-10-17', '2026-10-15', '2026-10-14', '2026-10-13']);
    await page.locator('.record-toolbar').scrollIntoViewIfNeeded();
    // 把列表标题对齐视口顶部，同时保留真实滚动容器和浮动按钮。
    await page.locator('.record-toolbar').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: info.outputPath('records.png') });
    const geometry = await page.locator('.record-row').evaluateAll(rows => rows.map(el => ({
      width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth,
      buttons: Array.from(el.querySelectorAll('.record-front')).map(b => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })),
    })));
    for (const row of geometry) {
      expect(row.scrollWidth).toBeLessThanOrEqual(Math.ceil(row.width));
      for (const button of row.buttons) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
    }
    await page.getByRole('button', { name: '批量选择', exact: true }).click();
    await page.getByRole('checkbox').first().click();
    await expect(page.locator('.record-list-title')).toHaveText('已选 1 条');
    await expect(page.locator('.record-front-selected')).toHaveCount(1);
    await page.getByRole('button', { name: '删除所选 1 条记录', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '删除所选 1 条记录' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.record-header')).toHaveCount(8);
    expect(deleted).toHaveLength(0);
    await page.getByRole('button', { name: '完成选择', exact: true }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    // 删除入口只在左滑后存在，松手后的合成 click 不能打开编辑。
    await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(0);
    const firstRow = page.locator('.record-row').first();
    await swipeRecord(page, firstRow, -110);
    await firstRow.locator('.record-front').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(1);
    await expect(firstRow.locator('.record-front')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -68, 0)');
    await page.screenshot({ path: info.outputPath('swipe-delete.png') });
    await page.getByRole('button', { name: '删除运动', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '删除运动' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    // 右滑收回删除，再点击整行编辑；不保留独立编辑按钮。
    await swipeRecord(page, firstRow, 110);
    await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(0);
    await expect(firstRow.locator('.record-front')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.waitForTimeout(420);
    await firstRow.getByRole('button').tap();
    await expect(page.getByRole('dialog', { name: '编辑运动记录' })).toBeVisible();
    await expect(page.locator('[aria-label="运动数量"] input')).toHaveValue('600');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await swipeRecord(page, firstRow, -110);
    const secondRow = page.locator('.record-row').nth(1);
    await swipeRecord(page, secondRow, -110);
    await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(1);
    await expect(firstRow.locator('.record-front')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.getByRole('button', { name: '批量选择', exact: true }).click();
    await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(0);
    await expect(page.locator('.record-list-title')).toHaveText('已选 0 条');
  });
}

test('运动行纵向滚动不触发编辑，左滑删除失败可重试并保留字符串 ID', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const { data } = await prepare(page, 4);
  const calls = [];
  let fail = true;
  await page.route('**/api/exerciseRecord/deleteBatch', async route => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: fail ? { code: 1, message: '模拟删除失败' } : { code: 0, data: true } });
  });
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-row')).toHaveCount(4);
  const row = page.locator('.record-row').first();
  await swipeRecord(page, row, -8, -80);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除运动', exact: true })).toHaveCount(0);
  await swipeRecord(page, row, -110);
  await page.getByRole('button', { name: '删除运动', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除运动' });
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog).toContainText('模拟删除失败');
  await expect(page.locator('.record-row')).toHaveCount(4);
  fail = false;
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.record-row')).toHaveCount(3);
  expect(calls).toEqual([{ idList: [data[0].id] }, { idList: [data[0].id] }]);
});

test('分页失败保留页码和列表，底部重试失败页且不重查统计', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const { calls, statisticsCalls, state } = await prepare(page, 45);
  state.failPage = 2;
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-row')).toHaveCount(20);
  await bottom(page);
  await expect(page.locator('.load-more-error')).toContainText('模拟刷新失败');
  await expect(page.locator('.record-row')).toHaveCount(20);
  expect(calls).toEqual([1, 2]);
  state.failPage = 0;
  await page.getByRole('button', { name: '重试加载', exact: true }).click();
  await expect(page.locator('.record-row')).toHaveCount(40);
  expect(calls).toEqual([1, 2, 2]);
  await bottom(page);
  await expect(page.locator('.record-row')).toHaveCount(45);
  await bottom(page);
  expect(calls).toEqual([1, 2, 2, 3]);
  expect(statisticsCalls).toHaveLength(1);
});

test('旧分页晚于新筛选返回时不能覆盖或追加到新列表', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { calls, statisticsCalls } = await prepare(page, 603, { page: pending });
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-row')).toHaveCount(20);
  await bottom(page);
  await expect.poll(() => calls).toEqual([1, 2]);
  await page.locator('uni-picker[aria-label="运动类型"]').scrollIntoViewIfNeeded();
  await page.locator('uni-picker[aria-label="运动类型"]').click();
  await page.locator('.uni-picker-select:visible').getByText('模拟运动1', { exact: true }).click();
  await expect(page.locator('.record-type .title')).toHaveText(Array(20).fill('模拟运动1'));
  release();
  await expect(page.locator('.load-more')).toHaveCount(0);
  await expect(page.locator('.record-row')).toHaveCount(20);
  expect(calls).toEqual([1, 2, 1]);
  expect(statisticsCalls).toHaveLength(2);
});

test('刷新失败后触底不继续旧分页，重试成功后恢复分页', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const { calls, state } = await prepare(page, 603);
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-row')).toHaveCount(20);
  state.fail = true;
  await pullDown(page, '.mobile-page-scroll');
  await expect(page.getByRole('alert').last()).toContainText('模拟刷新失败');
  await bottom(page);
  expect(calls).toEqual([1, 1]);
  await expect(page.locator('.record-row')).toHaveCount(20);
  state.fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await bottom(page);
  await expect(page.locator('.record-row')).toHaveCount(40);
  expect(calls).toEqual([1, 1, 1, 2]);
});

test('删除后重置分页位置，后续滚动不会跳过记录', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const { data, calls } = await prepare(page, 45);
  await page.route('**/api/exerciseRecord/deleteBatch', async route => {
    const removed = new Set(route.request().postDataJSON().idList);
    for (let index = data.length - 1; index >= 0; index--) if (removed.has(data[index].id)) data.splice(index, 1);
    await route.fulfill({ json: { code: 0, data: true } });
  });
  await page.goto('/#/pages/records/exercise');
  await expect(page.locator('.record-row')).toHaveCount(20);
  await page.getByRole('button', { name: '批量选择', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '批量选择', exact: true }).click();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: '删除所选 1 条记录', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.record-row')).toHaveCount(20);
  await expect.poll(() => calls).toEqual([1, 1]);
  await bottom(page);
  await expect(page.locator('.record-row')).toHaveCount(40);
  expect(await page.locator('.record-description').allTextContents()).toEqual(data.slice(0, 40).map(row => row.description));
  expect(calls).toEqual([1, 1, 2]);
});
