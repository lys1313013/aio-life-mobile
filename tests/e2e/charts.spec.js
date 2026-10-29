const { test, expect } = require('./support/test');
const fs = require('node:fs');
const { calendarFixture } = require('./fixtures-finance-calendar');
test.use({ hasTouch: true });
const date = new Date();
const day = offset => { const d = new Date(date); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const names = ['交通', '运动', '项目', '社交', '阅读', '工作', '休息'];
const colors = ['#2f54eb', '#13c2c2', '#eb2f96', '#fa8c16', '#722ed1', '#1677ff', '#ffa500'];
const categories = names.map((name, i) => ({ id: String(i + 1), name, color: colors[i], timeType: 1 }));
function trendRecords() {
  return Array.from({ length: 10 }, (_, d) => {
    let start = 0;
    return categories.map((category, i) => {
      const duration = (i + 1) * 15 + d % 3 * 8;
      const row = { id: `${d + 1}${i + 1}`, date: day(-d), categoryId: category.id, startTime: start, endTime: start + duration - 1, title: category.name };
      start += duration;
      return row;
    });
  }).flat();
}
async function openTime(page, records = trendRecords()) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'chart-fixture'));
  const base = test.info().project.use.baseURL;
  const routes = ['/api/user/info', '/api/auth/secondary-lock/menus', '/api/timeTrackerCategory/list', '/api/timeRecord/query', '/api/timeRecord/queryByDateRange'];
  for (const path of routes) await page.route(url => url.origin === base && url.pathname === path, async route => {
    const url = new URL(route.request().url());
    let data = [];
    if (path === '/api/user/info') data = { id: '1', nickname: '图表模拟用户' };
    if (path === '/api/timeTrackerCategory/list') data = categories;
    if (path === '/api/timeRecord/query') data = records.filter(row => row.date === url.searchParams.get('date'));
    if (path === '/api/timeRecord/queryByDateRange') data = records.filter(row => row.date >= url.searchParams.get('startDate') && row.date <= url.searchParams.get('endDate'));
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/time/index');
  return page.getByRole('figure', { name: '近 10 天', exact: true });
}
async function painted(canvas) {
  return canvas.evaluate(node => {
    const pixels = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) count++;
    return count;
  });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`统一折线图左侧刻度、前五分类和触摸选择 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const chart = await openTime(page);
    await expect(chart.locator('.chart-y-tick').first()).toBeVisible();
    await expect.poll(() => painted(chart.locator('.aio-chart-canvas canvas'))).toBeGreaterThan(500);
    await expect(chart.locator('.chart-value-label')).toHaveText(['休息', '工作', '阅读', '社交', '项目']);
    await expect(chart.getByRole('button')).toHaveCount(0);
    await expect(chart.locator('.mini-chart-scale')).toHaveCount(0);
    const ticks = await chart.locator('.chart-y-tick').evaluateAll(items => items.map(item => ({ value: Number(item.textContent), box: item.getBoundingClientRect().toJSON() })));
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    const axis = await chart.locator('.chart-y-axis').boundingBox();
    for (let i = 0; i < ticks.length; i++) {
      expect(ticks[i].box.x + ticks[i].box.width).toBeLessThanOrEqual(axis.x + axis.width);
      if (i) { expect(ticks[i].value).toBeGreaterThan(ticks[i-1].value); expect(ticks[i].box.y).toBeLessThan(ticks[i-1].box.y); }
    }
    const plot = chart.getByRole('slider');
    await plot.scrollIntoViewIfNeeded();
    await plot.tap({ position: { x: axis.width, y: 60 } });
    await expect(plot).toHaveAttribute('aria-valuenow', '0');
    await expect(chart.locator('.chart-selected-label')).toHaveText(day(-9).slice(5));
    await plot.press('ArrowRight');
    await expect(plot).toHaveAttribute('aria-valuenow', '1');
    await expect(chart.locator('.chart-selected-label')).toHaveText(day(-8).slice(5));
    // Bottom value must be the selected point, not the latest-period value.
    await expect(chart.locator('.chart-value-number').first()).toHaveText('2.02h');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await plot.blur();
    fs.mkdirSync('artifacts/chart-validation/screenshots', { recursive: true });
    await chart.screenshot({ path: `artifacts/chart-validation/screenshots/time-${width}-${theme}.png` });
    expect(errors).toEqual([]);
  });
}
test('图表引擎加载失败可重试，空记录仍展示空状态', async ({ page }) => {
  let failures = 0;
  const pattern = '**/assets/*chart-engine-runtime*.js';
  await page.route(pattern, route => { failures++; return route.abort(); });
  const chart = await openTime(page);
  await expect(chart.getByText('图表加载失败', { exact: true })).toBeVisible();
  expect(failures).toBeGreaterThan(0);
  await page.unroute(pattern);
  await chart.getByRole('button', { name: '重试图表', exact: true }).click();
  await expect(chart.locator('.chart-y-tick').first()).toBeVisible();
  await expect.poll(() => painted(chart.locator('.aio-chart-canvas canvas'))).toBeGreaterThan(500);
  await page.route(url => url.pathname === '/api/timeRecord/queryByDateRange', route => route.fulfill({ json: { code: 0, data: [] } }));
  await page.reload();
  await expect(page.locator('.time-statistics').getByText('暂无记录', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.time-statistics .aio-chart-canvas')).toHaveCount(0);
});
test('图表上的纵向滚动不会误选日期', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const chart = await openTime(page);
  const plot = chart.getByRole('slider');
  await expect(chart.locator('.chart-y-tick').first()).toBeVisible();
  await plot.scrollIntoViewIfNeeded();
  const before = await plot.getAttribute('aria-valuenow');
  const box = await plot.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 3, y: box.y + 80 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 3, y: box.y + 80 - i * 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(plot).toHaveAttribute('aria-valuenow', before);
  await expect(chart.locator('.chart-selected-label')).toHaveCount(0);
  await cdp.detach();
});
for (const kind of ['全零', '单点', '负结余']) {
  test(`财务日历 ${kind} 的金额和格子有效`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'chart-finance-fixture'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const access = ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'];
    const income = kind === '全零' ? 0 : 100;
    const expense = kind === '全零' ? 0 : kind === '负结余' ? 200 : 50;
    const balance = income - expense;
    apiMock({
      'GET /api/user/info': { json: { code: 0, data: { id: '1', nickname: '日历模拟用户' } } },
      'GET /api/home/cards': { json: { code: 0, data: [{ cardKey: 'section.finance', title: '收支概览', group: 'section', isEnabled: true, sortOrder: 0 }] } },
      'GET /api/dashboard/tasks': { json: { code: 0, data: [] } },
      'GET /api/menu/all': { json: { code: 0, data: access.map((path, index) => ({ path, meta: { menuId: 'finance-' + index } })) } },
      'GET /api/quick-nav/candidates': { json: { code: 0, data: access.map(path => ({ path })) } },
      'GET /api/auth/secondary-lock/menus': { json: { code: 0, data: [] } },
      'GET /api/menu/visuals': { json: { code: 0, data: { menus: [], cards: {} } } },
      'GET /api/home/sections/finance/calendar': request => {
        const data = calendarFixture(new URL(request.url()), 'finance', kind === '全零' ? 0 : 1);
        Object.assign(data, { income, expense, balance, amount: balance });
        data.buckets.forEach((bucket, index) => Object.assign(bucket, {
          income: index ? 0 : income, expense: index ? 0 : expense,
          balance: index ? 0 : balance, amount: index ? 0 : balance,
        }));
        return { json: { code: 0, data } };
      },
    });
    await page.goto('/#/pages/home/index');
    const card = page.locator('[aria-label="收支概览首页卡片"]');
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect(card.getByRole('button', { name: '查看收入', exact: true })).toContainText(income.toFixed(2));
    await expect(card.getByRole('button', { name: '查看支出', exact: true })).toContainText(expense.toFixed(2));
    await expect(card.getByRole('button', { name: '查看结余', exact: true })).toContainText(balance.toFixed(2));
    const amounts = card.locator('.calendar-amount');
    await expect(amounts.first()).toHaveText(balance ? balance.toFixed(2) : '—');
    if (kind === '全零') expect((await amounts.allTextContents()).every(value => value === '—')).toBe(true);
    else expect((await amounts.allTextContents()).filter(value => value !== '—')).toEqual([balance.toFixed(2)]);
    const boxes = await card.locator('.calendar-cell').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every(box => Number.isFinite(box.width) && box.width > 0 && box.height > 0)).toBe(true);
    expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
