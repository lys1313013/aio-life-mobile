const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');

async function setup(page, { locked = false, failMore = false, readAccess = true, twoGoals = false } = {}) {
  const calls = [];
  const fixtures = {
    '/home/cards': homeCardFixture(),
    '/user/info': { id: 'fixture-user', nickname: '测试用户' },
    '/auth/secondary-lock/menus': locked ? ['read-menu'] : [],
    '/menu/all': [{ path: '/my-hub/read-record', meta: { menuId: 'read-menu' } }],
    '/quick-nav/candidates': ['/task-center/goal', '/my-hub/anniversary', '/my-hub/read-record', '/membership', '/my-hub/movie'].map(path => ({ path })),
    '/dashboard/tasks': [], '/quick-nav/my': [], '/thought/dashboard': [], '/taskDetails/watched': [],
    '/exerciseRecord/dashboardSummary': { days: [] }, '/timeTrackerCategory/list': [], '/timeRecord/query': [],
    '/goals': [{ id: '9223372036854775801', title: '固定目标', status: 'on_hold', isPinned: 1, targetValue: 12, currentValue: 3 }],
    '/anniversaryRecords': [], '/membership/list': [], '/movie/page': { items: [], total: 0 },
  };
  if (!readAccess) fixtures['/quick-nav/candidates'] = fixtures['/quick-nav/candidates'].filter(item => item.path !== '/my-hub/read-record');
  if (twoGoals) fixtures['/goals'].push({ id: '9223372036854775802', title: '第二个目标', status: 'in_progress', isPinned: 1 });
  for (const [path, data] of Object.entries(fixtures)) {
    const respond = route => route.fulfill({ json: { rscode: '0', data } });
    await page.route('**/api' + path, respond);
    await page.route('**/api' + path + '?*', respond);
  }
  let failures = failMore ? 1 : 0;
  await page.route('**/api/read-record/page?*', async route => {
    const current = Number(new URL(route.request().url()).searchParams.get('current'));
    calls.push(current);
    if (current === 2 && failures-- > 0) return route.fulfill({ status: 503, body: 'unavailable' });
    const all = Array.from({ length: 23 }, (_, i) => ({ id: String(i + 1), title: '阅读条目 ' + (i + 1), status: i < 20 ? 'in_progress' : 'not_started', totalProgress: 100, currentProgress: 30 }));
    return route.fulfill({ json: { rscode: '0', data: { items: all.slice((current - 1) * 20, current * 20), total: 23 } } });
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-home-business' })));
  await page.goto('/#/pages/home/index');
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
  return calls;
}

test('首页卡片保留分页失败数据，实际滚动触发、重试同页并在末页停止', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page, { failMore: true });
  const read = page.locator('[aria-label="阅读首页卡片"]');
  await expect(read.locator('.business-row')).toHaveCount(20);
  await read.scrollIntoViewIfNeeded();
  const scroll = read.locator('.uni-scroll-view[style]').first();
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(read.getByRole('button', { name: '重试阅读', exact: true })).toBeVisible();
  await expect(read.locator('.business-row')).toHaveCount(20);
  await read.getByRole('button', { name: '重试阅读', exact: true }).click();
  await expect(read.locator('.business-row')).toHaveCount(23);
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(200);
  expect(calls).toEqual([1, 2, 2]);
  expect(await read.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(280);
  expect(await page.locator('[aria-label="目标首页卡片"]').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(280);
  await expect(page.locator('[aria-label="会员首页卡片"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="纪念日首页卡片"]')).toHaveCount(0);
});

test('首页锁定卡片不读取业务内容、不自动弹密码输入框', async ({ page }) => {
  const calls = await setup(page, { locked: true });
  const read = page.locator('[aria-label="阅读首页卡片"]');
  await expect(read.getByRole('button', { name: '解锁阅读', exact: true })).toBeVisible();
  await expect(read.locator('.business-row')).toHaveCount(0);
  expect(calls).toEqual([]);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});


test('没有授权菜单的卡片不发业务请求', async ({ page }) => {
  const calls = await setup(page, { readAccess: false });
  await expect(page.locator('[aria-label="阅读首页卡片"]')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('首页固定操作菜单保存全部字符串 ID 顺序并支持取消固定', async ({ page }) => {
  await setup(page, { twoGoals: true });
  let order, pin;
  await page.route('**/api/goals/pinned-order', async route => {
    order = route.request().postDataJSON();
    await route.fulfill({ json: { rscode: '0', data: null } });
  });
  await page.route('**/api/goals/9223372036854775801/pin', async route => {
    pin = route.request().postDataJSON();
    await route.fulfill({ json: { rscode: '0', data: { id: '9223372036854775801', isPinned: 0 } } });
  });
  const goals = page.locator('[aria-label="目标首页卡片"]');
  await goals.scrollIntoViewIfNeeded();
  await goals.getByRole('button', { name: '第二个目标固定操作', exact: true }).click();
  await page.getByText('上移', { exact: true }).click();
  await expect.poll(() => order).toEqual({ ids: ['9223372036854775802', '9223372036854775801'] });
  await expect(goals.locator('.record-title').first()).toHaveText('第二个目标');
  await goals.getByRole('button', { name: '固定目标固定操作', exact: true }).click();
  await page.getByText('取消固定', { exact: true }).click();
  await expect.poll(() => pin).toEqual({ isPinned: 0 });
  await expect(goals.locator('.business-row')).toHaveCount(1);
});

for (const kind of ['read', 'movie', 'member']) {
  test(`首页 ${kind} 条目复用原编辑弹窗，保存返回后同步卡片`, async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await setup(page);
    const label = kind === 'read' ? '阅读' : kind === 'movie' ? '观影' : '会员';
    const base = kind === 'read' ? '/read-record' : kind === 'movie' ? '/movie' : '/membership';
    let row = kind === 'member'
      ? { id: '9223372036854775807', name: '首页编辑会员', provider: '测试平台', category: 'other', startDate: '2026-01-01', expiryDate: '2026-10-30', autoRenew: 1, billingCycle: 'month', monthlyAmount: 20, price: 20, note: '保留会员备注', color: '#722ed1' }
      : { id: '9223372036854775807', title: '首页编辑作品', type: 1, status: 'in_progress', totalProgress: 100, currentProgress: 30, author: '原作者', director: '原导演', remark: '保留完整详情备注', url: '', fileId: '', coverImgUrl: '' };
    let written;
    if (kind === 'member') {
      await page.route('**/api/membership/list', route => route.fulfill({ json: { rscode: '0', data: [row] } }));
      await page.route('**/api/membership/stats', route => route.fulfill({ json: { rscode: '0', data: {} } }));
    } else {
      await page.route('**/api' + base + '/page?*', route => {
        const activeOnly = new URL(route.request().url()).searchParams.get('activeOnly') === 'true';
        const items = !activeOnly || row.status !== 'completed' ? [row] : [];
        return route.fulfill({ json: { rscode: '0', data: { items, total: items.length } } });
      });
      await page.route('**/api' + base + '/' + row.id, route => route.fulfill({ json: { rscode: '0', data: row } }));
    }
    await page.route('**/api' + base, route => {
      written = route.request().postDataJSON();
      row = { ...row, ...written };
      return route.fulfill({ json: { rscode: '0', data: row } });
    });
    await page.reload();
    const card = page.locator(`[aria-label="${label}首页卡片"]`);
    await card.getByRole('button', { name: '编辑' + (row.title || row.name), exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    if (kind === 'member') {
      await dialog.getByRole('button', { name: '1年', exact: true }).click();
      await expect(dialog.locator('uni-picker[aria-label="到期日期"]')).toContainText('2027-01-01');
    } else {
      await expect(dialog.locator('[aria-label="名称"] input')).toHaveValue(row.title);
      await dialog.locator('uni-picker[aria-label="状态"]').click();
      await page.locator('.uni-picker-select:visible').getByText(kind === 'read' ? '读完' : '看过', { exact: true }).click();
    }
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(written.id).toBe('9223372036854775807');
    expect(kind === 'member' ? written.note : written.remark).toBe(kind === 'member' ? '保留会员备注' : '保留完整详情备注');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page).toHaveURL(/pages\/home\/index/);
    if (kind === 'member') await expect(card).toContainText('2027-01-01');
    else { expect(written.status).toBe('completed'); await expect(card).toHaveCount(0); }
  });
}
