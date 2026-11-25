const { test, expect } = require('./support/test');
const { stableBox } = require('./support/geometry');

const ok = data => ({ json: { code: 0, message: null, data } });
const paged = items => ok({ items, total: items.length });
const date = '2026-10-19';
const categories = [
  { id: '11', name: '模拟学习', color: '#427bea', isTrackTime: 1, isEnabled: 1 },
  { id: '12', name: '模拟运动', color: '#168251', isTrackTime: 1, isEnabled: 1 },
];
const feedback = [
  { id: '11', feedbackType: 'BUG', status: 'PENDING', title: '模拟待处理反馈', createTime: date, commentCount: 0 },
  { id: '12', feedbackType: 'SUGGESTION', status: 'RESOLVED', title: '模拟已解决反馈', createTime: date, commentCount: 1 },
];

async function prepare(page, apiMock) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'filter-sheets-fixture'));
  apiMock({
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/user/info': ok({ id: '1', nickname: '模拟管理员', roles: ['admin'] }),
    'GET /api/goals': request => {
      const type = new URL(request.url()).searchParams.get('type');
      const goals = [
        { id: '31', type: 3, status: 'in_progress', title: '模拟月目标', targetValue: 4, currentValue: 1, tags: [] },
        { id: '32', type: 4, status: 'in_progress', title: '模拟季目标', targetValue: 4, currentValue: 2, tags: [] },
      ];
      return ok(goals.filter(goal => !type || String(goal.type) === type));
    },
    'GET /api/honorCategories': ok([{ id: '11', name: '模拟个人荣誉' }, { id: '12', name: '模拟团队荣誉' }]),
    'GET /api/honorRecords': ok([
      { id: '11', title: '模拟个人奖项', categoryId: '11', honorDate: date, level: 'city', tags: [] },
      { id: '12', title: '模拟团队奖项', categoryId: '12', honorDate: date, level: 'national', tags: [] },
    ]),
    'GET /api/milestones': ok([
      { id: '11', type: 'work', title: '模拟工作里程碑', date, tags: ['项目'] },
      { id: '12', type: 'life', title: '模拟生活里程碑', date, tags: ['家庭'] },
    ]),
    'GET /api/feedback/my': request => {
      const status = new URL(request.url()).searchParams.get('status');
      return paged(feedback.filter(row => !status || row.status === status));
    },
    'GET /api/feedback/admin/list': paged(feedback.map(row => ({ ...row, userName: '模拟用户', priority: 'LOW' }))),
    'GET /api/system/logs/access': paged([
      { id: '11', username: '模拟账号一', accessType: 'Web', success: true, createTime: date },
      { id: '12', username: '模拟账号二', accessType: '小程序', success: false, createTime: date },
    ]),
    'GET /api/system/membership-providers': ok([
      { id: '11', name: '模拟会员平台', code: 'fixture-video', category: 'video', iconKey: null, isEnabled: 1, sortOrder: 0 },
      { id: '12', name: '模拟其他平台', code: 'fixture-other', category: 'other', iconKey: null, isEnabled: 1, sortOrder: 1 },
    ]),
    'GET /api/membership/provider-icons': ok([]),
    'GET /api/timeTrackerCategory/all': ok(categories),
    'GET /api/timeRecord/queryByDateRange': ok([
      { id: '11', categoryId: '11', date, startTime: 540, endTime: 599 },
      { id: '12', categoryId: '12', date, startTime: 600, endTime: 659 },
    ]),
  });
}

const pages = [
  { route: 'tasks/goals', trigger: '筛选目标', ready: '模拟月目标', field: '类型', search: true },
  { route: 'records/honor', trigger: '筛选荣誉', ready: '模拟个人奖项', field: '分类', search: true },
  { route: 'records/milestones', trigger: '筛选里程碑', ready: '模拟工作里程碑', field: '标签' },
  { route: 'records/feedback', trigger: '筛选反馈', ready: '模拟待处理反馈', field: '状态', before: '提交反馈' },
  { route: 'admin/index?kind=feedback', trigger: '筛选反馈管理', ready: '模拟待处理反馈', field: '状态' },
  { route: 'admin/index?kind=access', trigger: '日期筛选', ready: '模拟账号一', field: '开始日期', before: '导出日志', dialog: '筛选访问日志' },
  { route: 'admin/membership-providers', trigger: '筛选会员平台', ready: '模拟会员平台', field: '分类', search: true },
  { route: 'time/dashboard', trigger: '筛选分类', choice: '模拟学习', dialog: '筛选分类' },
];

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`统一筛选入口和面板 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await prepare(page, apiMock);
    for (const entry of pages) await test.step(entry.route, async () => {
      await page.goto('/#/pages/' + entry.route);
      await page.reload();
      const trigger = page.getByRole('button', { name: entry.trigger, exact: true });
      if (entry.ready) await expect(page.getByText(entry.ready, { exact: true }).first()).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      const position = await stableBox(trigger);
      expect(position.width).toBeGreaterThanOrEqual(44);
      expect(position.height).toBeGreaterThanOrEqual(44);
      if (entry.before || entry.search) {
        const before = await page.getByRole('button', { name: entry.before || '展开搜索', exact: true }).boundingBox();
        expect(before.x + before.width).toBeLessThanOrEqual(position.x);
      }
      await trigger.click();
      const sheet = page.getByRole('dialog', { name: entry.dialog || '快捷筛选', exact: true });
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      if (entry.field) await expect(sheet.locator(`[aria-label="${entry.field}"]`)).toBeVisible();
      if (entry.choice) await expect(sheet.getByRole('button', { name: entry.choice, exact: true })).toBeVisible();
      const panel = await stableBox(sheet);
      expect(panel.width).toBeLessThanOrEqual(Math.min(width, 480));
      expect(panel.y + panel.height).toBeCloseTo(900, 0);
      await page.screenshot({ path: info.outputPath(entry.route.replace(/[^a-z0-9-]/g, '-') + '.png') });
      await sheet.getByRole('button', { name: '关闭筛选', exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });
}

test('反馈状态仅在确定后生效，重置后恢复完整列表', async ({ page, apiMock }) => {
  await prepare(page, apiMock);
  await page.goto('/#/pages/records/feedback');
  const pending = page.getByText('模拟待处理反馈', { exact: true });
  const resolved = page.getByText('模拟已解决反馈', { exact: true });
  const trigger = page.getByRole('button', { name: '筛选反馈', exact: true });
  const sheet = page.getByRole('dialog', { name: '快捷筛选', exact: true });
  await expect(pending).toBeVisible();
  await trigger.click();
  await sheet.locator('uni-picker[aria-label="状态"]').click();
  await page.locator('.uni-picker-select:visible').getByText('已解决', { exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(trigger).not.toHaveAttribute('aria-description', '已启用筛选');
  await sheet.getByRole('button', { name: '确定', exact: true }).click();
  await expect(pending).toBeHidden();
  await expect(resolved).toBeVisible();
  await expect(trigger).toHaveAccessibleDescription('已启用筛选');
  await trigger.click();
  await sheet.getByRole('button', { name: '重置', exact: true }).click();
  await sheet.getByRole('button', { name: '确定', exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(resolved).toBeVisible();
});
