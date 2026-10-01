const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const { pullDown } = require('./gestures.js');
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
async function setup(page, options = {}) {
  const state = { queries: 0, ranges: [], creates: [], updates: [], deletes: 0, profiles: 0, failRefresh: false, failSave: false, failDelete: false, detailFailure: false, full: false,
    records: [{ id: '9223372036854775807', date: today, categoryId: '2', startTime: 540, endTime: 599, title: '晨间运动', description: '保留原有备注', exercises: [{ exerciseTypeId: '9223372036854775806', exerciseCount: 20, description: '三组' }], relateId: '9223372036854775805', relateType: 1 }] };
  Object.assign(state, options);
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    let data = dashboardFixture(path);
    if (path === '/api/timeTrackerCategory/list' && state.categories) data = state.categories;
    if (path === '/api/auth/login') data = { accessToken: 'time-fixture' };
    if (path === '/api/user/info') { state.profiles++; data = { id: '1', nickname: '时迹测试用户' }; }
    if (path === '/api/timeRecord/query') {
      state.queries++;
      if (state.failRefresh) return route.abort();
      data = { items: state.records.filter(r => r.date === url.searchParams.get('date')), total: state.records.filter(r => r.date === url.searchParams.get('date')).length };
    }
    if (path === '/api/timeRecord/queryByDateRange') {
      state.ranges.push([url.searchParams.get('startDate'), url.searchParams.get('endDate')]);
      data = state.records.filter(r => r.date >= url.searchParams.get('startDate') && r.date <= url.searchParams.get('endDate'));
    }
    if (path === '/api/timeRecord/recommendNext') data = { records: state.records.filter(r => r.date === url.searchParams.get('date')), recommend: state.full ? null : { categoryId: '1', startTime: 600, endTime: 659, date: today } };
    if (path === '/api/timeRecord/relateTypes') data = [{ label: '阅读', value: 1 }, { label: '观影', value: 2 }];
    if (path === '/api/userDictType/getByDictType') data = { dictDetailList: [{ id: '9223372036854775806', dictLabel: '俯卧撑' }] };
    if (path === '/api/timeRecord' && method === 'POST') {
      state.creates.push(req.postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 200));
      if (state.failSave) return route.fulfill({ status: 503, body: 'unavailable' });
      data = '9223372036854775804'; state.records.push({ ...req.postDataJSON(), id: data });
    }
    const match = path.match(/^\/api\/timeRecord\/(\d+)$/);
    if (match && method === 'GET') {
      if (state.detailFailure) return route.abort();
      data = state.records.find(r => r.id === match[1]);
    }
    if (match && method === 'PUT') {
      const payload = req.postDataJSON(); state.updates.push(payload);
      state.records = state.records.map(r => r.id === match[1] ? { ...r, ...payload } : r); data = null;
    }
    if (match && method === 'DELETE') {
      state.deletes++;
      if (state.failDelete) return route.abort();
      state.records = state.records.filter(r => r.id !== match[1]); data = null;
    }
    if (path === '/api/read-record/page') data = { records: [{ id: '9223372036854775803', title: '时间之书' }], total: 1 };
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
  await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑记录 晨间运动' })).toBeVisible();
  return state;
}

test('时迹新增、失败保留、重复提交、编辑保留附属字段、删除失败恢复', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page);
  await page.getByRole('button', { name: '新增时迹' }).click();
  await expect(page.getByRole('dialog', { name: '记录时间', exact: true }).getByText('10:00', { exact: true })).toBeVisible();
  await page.locator('[aria-label="记录标题"] input').fill('专注学习');
  await page.getByRole('button', { name: '选择分类', exact: true }).click();
  await page.getByRole('button', { name: '学习', exact: true }).click();
  state.failSave = true;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await expect(page.locator('.form-error')).toBeVisible();
  await expect(page.locator('[aria-label="记录标题"] input')).toHaveValue('专注学习');
  expect(state.creates.length).toBe(1);
  state.failSave = false;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑记录 专注学习' })).toBeVisible();
  expect(state.creates[1]).toMatchObject({ categoryId: '1', startTime: 600, endTime: 659, date: today });
  expect(state.creates[1]).not.toHaveProperty('id');
  await page.getByRole('button', { name: '编辑记录 晨间运动' }).click();
  await expect(page.locator('.exercise-picker').getByText('俯卧撑', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '结束时间 -1 分钟' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑记录 晨间运动' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '编辑时迹', exact: true })).toHaveCount(0);
  expect(state.updates[0]).toMatchObject({ id: '9223372036854775807', endTime: 598, relateId: '9223372036854775805', relateType: 1, description: '保留原有备注', exercises: [{ exerciseTypeId: '9223372036854775806', exerciseCount: 20, description: '三组' }] });
  await page.getByRole('button', { name: '编辑记录 专注学习' }).click();
  await page.getByRole('button', { name: '删除记录', exact: true }).click();
  await page.locator('.delete-confirm').getByRole('button', { name: '取消', exact: true }).click();
  expect(state.deletes).toBe(0);
  state.failDelete = true;
  await page.getByRole('button', { name: '删除记录', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.locator('.form-error')).toContainText('连接失败');
  state.failDelete = false;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑记录 晨间运动' })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑记录 专注学习' })).toHaveCount(0);
});

test('完整详情未读到不能编辑；全天已满不能新增', async ({ page }) => {
  const state = await setup(page, { detailFailure: true });
  await page.getByRole('button', { name: '编辑记录 晨间运动' }).click();
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  state.detailFailure = false;
  await page.getByRole('button', { name: '重试加载' }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  state.full = true;
  await page.getByRole('button', { name: '新增时迹' }).click();
  await expect(page.getByText('该天已录入完毕')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
});

test('日周月查询与重叠校验', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '周视图' }).click();
  const currentWeek = () => state.ranges.find(([start, end]) => start <= today && end >= today && Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) === 6);
  await expect.poll(currentWeek).toBeTruthy();
  const start = new Date(currentWeek()[0] + 'T12:00:00');
  expect(start.getDay()).toBe(1);
  await page.getByRole('button', { name: '月视图' }).click();
  await expect.poll(() => state.ranges.some(([start, end]) => start === today.slice(0, 7) + '-01' && end.slice(0, 7) === today.slice(0, 7))).toBe(true);
  await page.getByRole('button', { name: '日视图' }).click();
  await page.getByRole('button', { name: '新增时迹' }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  // 编辑期间其他客户端占用了推荐时段，保存前重新查询并阻止覆盖。
  state.records.push({ id: 'other', date: today, categoryId: '1', startTime: 610, endTime: 620 });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('时间段与已有记录重叠', { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(0);
});

test('三页下拉刷新、失败收起与恢复，移除常驻刷新按钮', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('button', { name: /^刷新/ })).toHaveCount(0);
  const count = state.queries;
  await pullDown(page, '.tab-scroll');
  await expect.poll(() => state.queries).toBeGreaterThan(count);
  await expect(page.locator('.uni-scroll-view-refresher').last()).toHaveCSS('height', '0px');
  state.failRefresh = true;
  await pullDown(page, '.tab-scroll');
  await expect(page.getByText('连接失败，请检查网络后重试')).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑记录 晨间运动' })).toBeVisible();
  state.failRefresh = false;
  await pullDown(page, '.tab-scroll');
  await expect(page.getByRole('button', { name: '重试时迹记录' })).toHaveCount(0);
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
  const before = state.profiles;
  await pullDown(page, '.dashboard-scroll');
  await expect.poll(() => state.profiles).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: /^刷新/ })).toHaveCount(0);
  await page.locator('uni-tabbar').getByText('我的', { exact: true }).click();
  await expect(page.getByText('时迹测试用户', { exact: true })).toBeVisible();
  const profileBefore = state.profiles;
  await pullDown(page, '.tab-scroll');
  await expect.poll(() => state.profiles).toBeGreaterThan(profileBefore);
});

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`时迹编辑布局 ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    const content = await page.locator('.tab-page').last().boundingBox();
    const body = await page.locator('uni-page-body').last().boundingBox();
    expect(Math.abs(content.height - body.height)).toBeLessThan(2);
    await page.screenshot({ path: `test-results/time-full-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '编辑记录 晨间运动' }).click();
    await expect(page.locator('.exercise-picker').getByText('俯卧撑', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/time-editor-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '选择分类', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '选择分类', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/time-categories-${width}-${colorScheme}.png` });
    expect(errors).toEqual([]);
  });
}

test('首页待记录时长与加号、起止各四个快捷调时、小时分钟联动、取消不保存', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(today + 'T11:20:00') });
  const state = await setup(page);
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page.getByRole('button', { name: '新增时迹', exact: true })).toContainText('1h20m');
  await page.clock.fastForward(60000);
  await expect(page.getByRole('button', { name: '新增时迹', exact: true })).toContainText('1h21m');
  await page.getByRole('button', { name: '新增时迹', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '记录时间', exact: true })).toBeVisible();
  await expect(page.getByText('10:59', { exact: true })).toBeVisible();
  for (const field of ['开始时间', '结束时间']) for (const delta of ['-1', '+1', '-30', '+30']) await expect(page.getByRole('button', { name: `${field} ${delta} 分钟`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始时间 -30 分钟', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '记录时间', exact: true }).getByText('10:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始时间 +1 分钟', exact: true }).click();
  await expect(page.getByText('10:01', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="时长分钟"] input')).toHaveValue('59');
  await page.locator('[aria-label="时长分钟"] input').fill('24');
  await expect(page.getByText('10:24', { exact: true })).toBeVisible();
  await page.locator('[aria-label="时长小时"] input').fill('1');
  await expect(page.getByText('11:24', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  expect(state.creates).toHaveLength(0);
  await page.getByRole('button', { name: '编辑时迹 运动', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑时迹', exact: true })).toBeVisible();
});

const timelineRecords = () => [
  { id: '101', date: today, categoryId: '1', startTime: 0, endTime: 10, title: '睡前阅读' },
  { id: '102', date: today, categoryId: '3', startTime: 11, endTime: 479, title: '休息' },
  { id: '103', date: today, categoryId: '4', startTime: 480, endTime: 509, title: '早餐' },
  { id: '104', date: today, categoryId: '1', startTime: 510, endTime: 539, title: '通勤' },
  { id: '9223372036854775807', date: today, categoryId: '2', startTime: 540, endTime: 599, title: '晨间运动' },
  { id: '105', date: today, categoryId: '1', startTime: 600, endTime: 719, title: '专注学习' },
  { id: '106', date: today, categoryId: '2', startTime: 1439, endTime: 1439, title: '一分钟回顾' },
];
for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`时间轴比例、边界及布局 ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await setup(page, { records: timelineRecords(), categories: [{ id: '1', name: '学习', color: '#1677ff' }, { id: '2', name: '运动', color: '#13bdbd' }, { id: '3', name: '休息', color: '#faad14' }, { id: '4', name: '吃饭', color: '#fa8c16' }] });
    const timeline = page.locator('.timeline');
    const track = await page.locator('.day-track').boundingBox();
    const gym = await page.getByRole('button', { name: '编辑记录 晨间运动' }).boundingBox();
    const work = await page.getByRole('button', { name: '编辑记录 专注学习' }).boundingBox();
    const last = await page.getByRole('button', { name: '编辑记录 一分钟回顾' }).boundingBox();
    expect(Math.abs((gym.y - track.y) / track.height - 540 / 1440)).toBeLessThan(0.001);
    expect(work.height / gym.height).toBeCloseTo(2, 1);
    expect(last.height).toBeGreaterThan(0);
    expect(Math.abs(last.y + last.height - track.y - track.height)).toBeLessThan(1);
    expect(await page.locator('.hour-label').count()).toBe(23);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/timeline-${width}-${colorScheme}.png` });
    await expect(page.locator('.time-statistics')).toBeVisible();
    await expect(page.getByRole('figure', { name: '时间分布', exact: true })).toBeVisible();
    await expect(page.locator('.time-statistics')).toBeVisible();
    await page.getByRole('button', { name: '周视图' }).click();
    await expect(page.locator('.timeline-column')).toHaveCount(7);
    const weekScroll = page.locator('.timeline-scroll .uni-scroll-view').last();
    const weekSizes = await weekScroll.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(weekSizes.scroll).toBeLessThanOrEqual(weekSizes.width + 1);
    await page.screenshot({ path: `test-results/timeline-week-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '月视图' }).click();
    const days = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
    await expect(page.locator('.timeline-column')).toHaveCount(days);
    const scroll = page.locator('.timeline-scroll .uni-scroll-view').last();
    const sizes = await scroll.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.width);
    const box = await scroll.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 20, y: box.y + 90 }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 20 - (box.width - 45) * step / 6, y: box.y + 90 }] });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    expect((await timeline.boundingBox()).width).toBeLessThanOrEqual(width);
  });
}

test('短记录通过日期列表编辑，跨日记录沿用所属日期，空日期保留刻度', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page, { records: timelineRecords(), categories: [{ id: '1', name: '学习', color: '#1677ff' }, { id: '2', name: '运动', color: '#13bdbd' }, { id: '3', name: '休息', color: '#faad14' }, { id: '4', name: '吃饭', color: '#fa8c16' }] });
  await page.getByRole('button', { name: `查看 ${today} 记录列表`, exact: true }).click();
  const row = page.locator('.day-sheet').getByRole('button', { name: '编辑记录 一分钟回顾', exact: true });
  expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await row.click();
  await expect(page.getByText('23:59', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(page.getByText('这段时间还没有记录', { exact: true })).toBeVisible();
  await expect(page.locator('.hour-label')).toHaveCount(23);
  await expect(page.locator('.timeline-event')).toHaveCount(0);
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await page.getByRole('button', { name: '周视图' }).click();
  await expect(page.locator('.timeline-column')).toHaveCount(7);
  const otherDate = (() => { const date = new Date(today + 'T12:00:00'); const weekday = (date.getDay() + 6) % 7; date.setDate(date.getDate() + (weekday === 0 ? 1 : -weekday)); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; })();
  state.records.push({ id: '107', date: otherDate, categoryId: '1', startTime: 0, endTime: 59, title: '跨日记录' });
  await pullDown(page, '.tab-scroll');
  await page.getByRole('button', { name: '编辑记录 跨日记录', exact: true }).click();
  await expect(page.locator('[aria-label="记录标题"] input')).toHaveValue('跨日记录');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑时迹', exact: true })).toHaveCount(0);
  expect(state.updates.at(-1).date).toBe(otherDate);
});

const categoryPalette = [
  ['3', '休息', 'lucide:bed', '#faad14'], ['5', '项目', 'lucide:code-2', '#722ed1'],
  ['1', '学习', 'ant-design:book-outlined', '#52c41a'], ['6', '工作', 'lucide:briefcase', '#1677ff'],
  ['2', '运动', 'lucide:dumbbell', '#fa541c'], ['4', '吃饭', 'lucide:utensils', '#fa8c16'],
  ['7', '卫生', 'lucide:bath', '#13c2c2'], ['8', '交通', 'lucide:car', '#2f54eb'],
  ['9', '阅读', 'lucide:book-open', '#faad14'], ['10', '理财', 'ri:money-cny-box-line', '#f5222d'],
  ['11', '娱乐', 'tabler:pacman', '#eb2f96'], ['12', '家务', 'lucide:home', '#28649d'],
  ['13', '观影', 'lucide:monitor', '#1890ff'], ['14', '社交', 'lucide:users', '#eb2f96'],
  ['15', '其他', 'basil:other-1-outline', '#bfbfbf'],
].map(([id, name, icon, color]) => ({ id, name, icon, color }));

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`时迹弹窗随内容自适应 ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await setup(page, { records: timelineRecords(), categories: categoryPalette });
    await page.getByRole('button', { name: '编辑记录 专注学习', exact: true }).click();
    const dialog = page.locator('.modal-panel[aria-label="编辑时迹"]');
    await expect(dialog.locator('[aria-label="记录标题"] input')).toHaveValue('专注学习');
    await expect.poll(async () => (await dialog.boundingBox()).height).toBeGreaterThan(400);
    const simple = await dialog.boundingBox();
    const content = await dialog.locator('.modal-content').boundingBox();
    expect(Math.abs(simple.height - content.height)).toBeLessThan(2);
    expect(simple.height).toBeLessThan(700);
    expect(Math.abs(simple.y + simple.height / 2 - 450)).toBeLessThan(2);
    const steps = await dialog.locator('.time-column').first().locator('.duration-step').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height }; }));
    expect(steps.every(item => item.height >= 44)).toBe(true);
    expect(new Set(steps.map(item => item.y)).size).toBe(1);
    await expect(dialog.locator('.step-face').first()).toHaveCSS('border-top-style', 'solid');
    await page.screenshot({ path: `test-results/time-modal-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '选择分类', exact: true }).click();
    const category = page.locator('.modal-panel[aria-label="选择分类"]');
    await expect(category.locator('.category-option')).toHaveCount(15);
    await expect.poll(() => category.locator('.category-icon-image img').evaluateAll(imgs => imgs.filter(img => img.complete && img.naturalWidth > 0).length)).toBe(15);
    const positions = await category.locator('.category-option').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(new Set(positions.slice(0, 4).map(p => p.y)).size).toBe(1);
    expect(positions[4].y).toBeGreaterThan(positions[0].y);
    expect((await category.boundingBox()).height).toBeLessThan(480);
    await page.screenshot({ path: `test-results/category-palette-${width}-${colorScheme}.png` });
    await expect(category.locator('.selection-heading')).toHaveCount(0);
    await expect(category.getByRole('button')).toHaveCount(15);
    await page.locator('.modal-mask').last().click({ position: { x: 8, y: 8 } });
    await expect(category).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '选择分类', exact: true }).click();
    await category.getByRole('button', { name: '运动', exact: true }).click();
    await expect.poll(async () => (await dialog.boundingBox()).height).toBeGreaterThan(simple.height);
    for (let i = 0; i < 10; i++) await dialog.getByRole('button', { name: '＋ 添加运动', exact: true }).click();
    const large = await dialog.boundingBox();
    expect(large.height).toBeLessThanOrEqual(852);
    const scroller = dialog.locator('.modal-scroll .uni-scroll-view').last();
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/pages\/time\/index/);
  });
}

test('描边调时按钮点击一次、长按连续调整，松手后停止', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole('button', { name: '新增时迹', exact: true }).click();
  const dialog = page.locator('.modal-panel[aria-label="记录时间"]');
  const end = dialog.locator('.time-number').nth(1);
  await expect(end).toHaveText('10:59');
  const increment = dialog.getByRole('button', { name: '结束时间 +1 分钟', exact: true });
  await increment.click();
  await expect(end).toHaveText('11:00');
  const box = await increment.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await expect.poll(() => end.innerText()).not.toBe('11:00');
  await page.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const released = await end.innerText();
  const [h, m] = released.split(':').map(Number);
  expect(h * 60 + m).toBeGreaterThanOrEqual(663);
  await page.waitForTimeout(400);
  await expect(end).toHaveText(released);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
});


for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`视图切换、多选筛选与通用新增按钮 ${width}px ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await setup(page, { records: timelineRecords(), categories: categoryPalette });
    const add = page.getByRole('button', { name: '新增时迹', exact: true });
    const initial = await add.boundingBox();
    const tabbar = await page.locator('uni-tabbar').boundingBox();
    expect(initial.height).toBe(56);
    expect(initial.y + initial.height).toBeLessThan(tabbar.y);
    await expect(add).not.toHaveCSS('background-image', 'none');
    const track = await page.locator('.day-track').boundingBox();
    expect(track.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: `test-results/time-aligned-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '卡片视图', exact: true }).click();
    await expect(page.locator('.record-card')).toHaveCount(7);
    await expect(page.locator('.timeline')).toHaveCount(0);
    await page.getByRole('button', { name: '筛选分类', exact: true }).click();
    await page.getByRole('button', { name: '筛选 学习', exact: true }).click();
    await page.getByRole('button', { name: '筛选 运动', exact: true }).click();
    await page.getByRole('button', { name: '应用筛选', exact: true }).click();
    await expect(page.locator('.record-card')).toHaveCount(5);
    await expect(page.getByRole('button', { name: '筛选分类', exact: true })).toHaveAttribute('aria-description', '2 个分类');
    await page.screenshot({ path: `test-results/time-cards-${width}-${colorScheme}.png` });
    await page.getByRole('button', { name: '编辑记录 一分钟回顾', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑时迹', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '时间轴视图', exact: true }).click();
    await expect(page.locator('.timeline-event')).toHaveCount(7);
    await expect(page.getByRole('button', { name: '编辑记录 休息', exact: true })).toHaveCSS('opacity', '0.25');
    await page.getByRole('button', { name: '筛选分类', exact: true }).click();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.getByRole('button', { name: '应用筛选', exact: true }).click();
    await expect(page.getByRole('button', { name: '编辑记录 休息', exact: true })).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: '卡片视图', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: '卡片视图', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.record-card')).toHaveCount(7);
    await add.click();
    await expect(page.getByRole('dialog', { name: '记录时间', exact: true })).toBeVisible();
  });
}

test('统计类型、每日分布、十期趋势失败恢复与分类口径', async ({ page }) => {
  const cats = [{ id: 'a', name: '学习', isTrackTime: 1, timeType: 2 }, { id: '1', name: '阅读', parentId: 'a', timeType: 2 }, { id: '2', name: '运动', timeType: 1 }, { id: '3', name: '休息', timeType: 1 }, { id: '4', name: '吃饭', timeType: 1 }];
  await setup(page, { records: timelineRecords(), categories: cats });
  await expect(page.locator('.time-statistics')).toBeVisible();
  await expect(page.locator('.tracked-item').first()).toContainText('学习');
  await expect(page.locator('.stat-name').getByText('学习', { exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: '时间类型分布', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: '时间类型分布', exact: true })).toContainText('积极');
  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.getByRole('figure', { name: '每日时间分布', exact: true })).toBeVisible();
  await expect(page.locator('.daily-stat')).toHaveCount(7);
  await page.route('**/timeRecord/queryByDateRange?**', route => route.abort());
  await page.getByRole('button', { name: '编辑记录 专注学习', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试趋势统计', exact: true })).toBeVisible();
  await page.unroute('**/timeRecord/queryByDateRange?**');
  await page.getByRole('button', { name: '重试趋势统计', exact: true }).click();
  await expect(page.locator('.mini-chart')).toBeVisible();
  await expect(page.locator('.mini-chart-title')).toContainText('记录日均');
});
