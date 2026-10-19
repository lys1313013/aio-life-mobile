const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const { pullDown } = require('./gestures');
test.use({ hasTouch: true });

const names = ['散步', '深蹲', '健腹轮', '正握引体向上', '蝴蝶机夹胸', '杠铃弯举', '杠铃卧推', '俯卧撑', '反握引体向上及自定义长名称'];
const values = [
  [0, 0, 2, 0, 0, 0, 0, 1, 0], [0, 0, 29, 0, 0, 0, 0, 5, 0],
  [0, 5, 13, 0, 0, 0, 0, 14, 0], [3, 3, 9, 0, 0, 0, 1, 10, 0],
  [4, 8, 11, 0, 0, 0, 0, 11, 0], [8, 1, 6, 0, 0, 0, 0, 18, 0],
  [8, 7, 6, 0, 0, 0, 0, 14, 0], [8, 4, 9, 0, 1, 0, 0, 12, 0],
  [2, 5, 7, 0, 2, 1, 0, 9, 0], [1, 1, 9, 2, 1, 1, 0, 10, 0],
  [3, 2, 7, 10, 1, 1, 1, 6, 6], [5, 1, 2, 2, 1, 1, 1, 3, 0],
];
const totals = values.map(row => String(row.reduce((sum, value) => sum + value, 0)));
const points = values.flatMap((row, month) => row.flatMap((count, type) => Array.from({ length: count }, (_, day) => ({
  exerciseTypeId: String(81 + type), exerciseDate: new Date(Date.UTC(2025, 10 + month, day + 1)).toISOString().slice(0, 10),
  exerciseCount: 50, recordCount: 2,
}))));
async function prepare(page, data = points) {
  await setup(page);
  const state = { data, fail: false, hold: null, statisticsCalls: [] };
  await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({ json: { code: 0, data: {
    dictDetailList: names.map((dictLabel, index) => ({ id: String(81 + index), dictLabel })),
  } } }));
  await page.route('**/api/exerciseRecord/query?*', route => route.fulfill({ json: { code: 0, data: { items: [], total: 0 } } }));
  await page.route('**/api/exerciseRecord/statistics/summary?*', async route => {
    state.statisticsCalls.push(route.request().url());
    if (state.hold) await state.hold;
    await route.fulfill({ json: state.fail ? { code: 1, message: '模拟统计失败' } : { code: 0, data: state.data } });
  });
  return state;
}
const geometry = chart => chart.evaluate(element => ({ height: element.getBoundingClientRect().height,
  next: element.nextElementSibling.getBoundingClientRect().top - element.getBoundingClientRect().top }));

async function swipeMonths(page, chart, direction) {
  const box = await chart.locator('.aio-chart-canvas').boundingBox();
  const x = box.x + box.width * (direction === 'right' ? 0.2 : 0.8), y = box.y + 90;
  const dx = direction === 'right' ? box.width * 0.6 : direction === 'left' ? -box.width * 0.6 : 0;
  const dy = direction === 'vertical' ? -90 : 0;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const fraction of [0.1, 0.3, 0.5, 0.7, 1]) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * fraction, y: y + dy * fraction }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`月度运动堆叠柱和图例 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await prepare(page);
    let release;
    state.hold = new Promise(resolve => { release = resolve; });
    await page.goto('/#/pages/records/exercise');
    const chart = page.getByRole('figure', { name: '每月运动次数', exact: true });
    await expect(chart.getByText('正在加载图表', { exact: true })).toBeVisible();
    const before = await geometry(chart);
    release(); state.hold = null;
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
    expect(await geometry(chart)).toEqual(before);
    await expect(chart.locator('.chart-legend-button')).toHaveCount(names.length);
    expect(await chart.locator('.chart-stack-label').count()).toBeGreaterThan(10);
    await chart.scrollIntoViewIfNeeded();
    await chart.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await expect(chart.locator('.chart-x-label')).toHaveText(['5月', '6月', '7月', '8月', '9月', '10月']);
    await expect(chart.locator('.monthly-year')).toHaveText('2026');
    await chart.screenshot({ path: info.outputPath('stacked.png') });
    const labels = await chart.locator('.chart-stack-label').evaluateAll(elements => elements.map(el => ({
      text: el.textContent, box: el.getBoundingClientRect().toJSON(), scrollWidth: el.scrollWidth,
    })));
    for (const label of labels) expect(label.scrollWidth).toBeLessThanOrEqual(Math.ceil(label.box.width));
    const plot = chart.getByRole('slider');
    await plot.focus(); await plot.press('ArrowLeft');
    await expect(chart.getByRole('tooltip')).toContainText('2026-09 · 合计 37次');
    await chart.getByRole('button', { name: '散步', exact: true }).click();
    await expect(chart.getByRole('button', { name: '散步', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(chart.locator('.chart-stack-total')).toHaveText(values.slice(-6).map(row => String(row.reduce((sum, v) => sum + v, 0) - row[0])));
    await chart.getByRole('button', { name: '散步', exact: true }).click();
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
    // 已有数据刷新时保留柱体和下方卡片位置。
    const loaded = await geometry(chart);
    state.hold = new Promise(resolve => { release = resolve; });
    try {
      await pullDown(page, '.mobile-page-scroll');
      await expect(page.getByRole('status', { name: '正在更新统计', exact: true })).toBeVisible();
      await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
      expect(await geometry(chart)).toEqual(loaded);
    } finally { release(); state.hold = null; }
    await expect(page.getByRole('status', { name: '正在更新统计', exact: true })).toHaveCount(0);
    expect(await geometry(chart)).toEqual(loaded);
    await chart.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const calls = state.statisticsCalls.length;
    await swipeMonths(page, chart, 'right');
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(0, 6));
    await expect(chart.locator('.monthly-year')).toHaveText('2025–2026');
    await expect(chart.locator('.chart-x-label')).toHaveText(['11月', '12月', '1月', '2月', '3月', '4月']);
    await expect(chart.getByRole('tooltip')).toHaveCount(0);
    await expect(chart.getByRole('button', { name: '查看更早的六个月' })).toBeDisabled();
    await chart.screenshot({ path: info.outputPath('older-six-months.png') });
    await swipeMonths(page, chart, 'right');
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(0, 6));
    await swipeMonths(page, chart, 'left');
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
    await expect(chart.getByRole('button', { name: '查看更新的六个月' })).toBeDisabled();
    await chart.getByRole('button', { name: '查看更早的六个月' }).click();
    await expect(chart.locator('.monthly-year')).toHaveText('2025–2026');
    await chart.getByRole('button', { name: '查看更新的六个月' }).click();
    await expect(chart.locator('.monthly-year')).toHaveText('2026');
    await swipeMonths(page, chart, 'vertical');
    await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
    await expect(chart.getByRole('tooltip')).toHaveCount(0);
    expect(state.statisticsCalls.length).toBe(calls);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('空数据与单条数据保留柱图高度，失败重试恢复且单类型可隐藏', async ({ page }) => {
  const state = await prepare(page, []);
  let release;
  state.hold = new Promise(resolve => { release = resolve; });
  await page.goto('/#/pages/records/exercise');
  const chart = page.getByRole('figure', { name: '每月运动次数', exact: true });
  await expect(chart.getByText('正在加载图表', { exact: true })).toBeVisible();
  const before = await geometry(chart);
  release(); state.hold = null;
  await expect(chart.getByText('暂无数据', { exact: true })).toBeVisible();
  expect(await geometry(chart)).toEqual(before);
  state.data = [points[0]];
  state.fail = true;
  // 通过筛选触发局部统计失败，重试后恢复。
  await page.locator('uni-picker[aria-label="运动类型"]').click();
  await page.locator('.uni-picker-select:visible').getByText('散步', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('模拟统计失败');
  state.fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(chart.locator('.chart-stack-total')).toHaveText(['1']);
  expect((await geometry(chart)).height).toEqual(before.height);
  await chart.locator('.chart-legend-button').click();
  await expect(chart.locator('.chart-stack-total')).toHaveCount(0);
  await chart.locator('.chart-legend-button').click();
  await expect(chart.locator('.chart-stack-total')).toHaveText(['1']);
});

test('月图切换全局筛选回到最新六个月，翻页不重复查询统计', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const state = await prepare(page);
  await page.route('**/api/exerciseRecord/statistics/summary?*', async route => {
    const url = new URL(route.request().url()), type = url.searchParams.get('exerciseTypeId');
    state.statisticsCalls.push(url.href);
    await route.fulfill({ json: { code: 0, data: type ? points.filter(point => point.exerciseTypeId === type) : points } });
  });
  await page.goto('/#/pages/records/exercise');
  const chart = page.getByRole('figure', { name: '每月运动次数', exact: true });
  await expect(chart.locator('.chart-stack-total')).toHaveText(totals.slice(-6));
  await chart.getByRole('button', { name: '查看更早的六个月' }).click();
  await expect(chart.locator('.monthly-year')).toHaveText('2025–2026');
  await page.locator('uni-picker[aria-label="运动类型"]').click();
  await page.locator('.uni-picker-select:visible').getByText('散步', { exact: true }).click();
  await expect(chart.locator('.chart-stack-total')).toHaveText(values.slice(-6).map(row => String(row[0])));
  await expect(chart.locator('.monthly-year')).toHaveText('2026');
  await expect(chart.getByRole('button', { name: '查看更新的六个月' })).toBeDisabled();
  await chart.getByRole('button', { name: '查看更早的六个月' }).click();
  await expect(chart.locator('.chart-x-label')).toHaveText(['2月', '3月', '4月']);
  await expect(chart.locator('.chart-stack-total')).toHaveText(['3', '4', '8']);
  await expect(chart.getByRole('button', { name: '查看更早的六个月' })).toBeDisabled();
  await chart.getByRole('button', { name: '查看更新的六个月' }).click();
  await expect(chart.locator('.chart-stack-total')).toHaveText(values.slice(-6).map(row => String(row[0])));
  expect(state.statisticsCalls.length).toBe(2);
});
