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
  await expect(page.getByText('10:00', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: '返回', exact: true }).click();
  state.full = true;
  await page.getByRole('button', { name: '新增时迹' }).click();
  await expect(page.getByText('该天已录入完毕')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
});

test('日周月查询与重叠校验', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: '周视图' }).click();
  await expect.poll(() => state.ranges.length).toBe(2);
  const start = new Date(state.ranges[0][0] + 'T12:00:00');
  expect(start.getDay()).toBe(1);
  await page.getByRole('button', { name: '月视图' }).click();
  await expect.poll(() => state.ranges.length).toBe(4);
  expect(state.ranges[2][0]).toMatch(/-01$/);
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
    await expect(page.getByRole('button', { name: '关闭选择' })).toBeVisible();
    await page.screenshot({ path: `test-results/time-categories-${width}-${colorScheme}.png` });
    expect(errors).toEqual([]);
  });
}

test('首页待记录时长与加号、起止各四个快捷调时、小时分钟联动、取消不保存', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(today + 'T11:20:00') });
  const state = await setup(page);
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page.locator('.time-add-button')).toContainText('1h20m');
  await page.clock.fastForward(60000);
  await expect(page.locator('.time-add-button')).toContainText('1h21m');
  await page.getByRole('button', { name: '新增时迹', exact: true }).click();
  await expect(page.getByText('记录时间', { exact: true })).toBeVisible();
  await expect(page.getByText('10:59', { exact: true })).toBeVisible();
  for (const field of ['开始时间', '结束时间']) for (const delta of ['-1', '+1', '-30', '+30']) await expect(page.getByRole('button', { name: `${field} ${delta} 分钟`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始时间 -30 分钟', exact: true }).click();
  await expect(page.getByText('10:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始时间 +1 分钟', exact: true }).click();
  await expect(page.getByText('10:01', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="时长分钟"] input')).toHaveValue('59');
  await page.locator('[aria-label="时长分钟"] input').fill('24');
  await expect(page.getByText('10:24', { exact: true })).toBeVisible();
  await page.locator('[aria-label="时长小时"] input').fill('1');
  await expect(page.getByText('11:24', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('人生仪表盘', { exact: true })).toBeVisible();
  expect(state.creates).toHaveLength(0);
  await page.getByRole('button', { name: '编辑时迹 运动', exact: true }).click();
  await expect(page.getByText('编辑时迹', { exact: true })).toBeVisible();
});
