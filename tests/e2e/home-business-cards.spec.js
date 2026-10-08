const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');
const { pullDown } = require('./gestures');

async function setup(page, { locked = false, failMore = false, readAccess = true, twoGoals = false, goalCount = 0, anniversaryCount = 0, navigate = true, requests = [] } = {}) {
  const calls = [];
  const fixtures = {
    '/home/cards': homeCardFixture(),
    '/menu/visuals': { menus: [], cards: {} },
    '/user/info': { id: 'fixture-user', nickname: '测试用户' },
    '/auth/secondary-lock/menus': locked ? ['read-menu'] : [],
    '/menu/all': [{ path: '/my-hub/read-record', meta: { menuId: 'read-menu' } }],
    '/quick-nav/candidates': ['/task-center/goal', '/my-hub/anniversary', '/my-hub/read-record', '/membership', '/my-hub/movie'].map(path => ({ path })),
    '/dashboard/tasks': [], '/quick-nav/my': [], '/thought/dashboard': [], '/taskDetails/watched': [],
    '/exerciseRecord/dashboardSummary': { days: [] }, '/timeTrackerCategory/list': [], '/timeRecord/query': [],
    '/goals': [{ id: '9223372036854775801', title: '固定目标', type: 1, content: '保留行动计划', tags: '["运动"]', status: 'on_hold', isPinned: 1, targetValue: 12, currentValue: 3 }],
    '/anniversaryRecords': [], '/membership/list': [], '/movie/page': { items: [], total: 0 },
  };
  if (!readAccess) fixtures['/quick-nav/candidates'] = fixtures['/quick-nav/candidates'].filter(item => item.path !== '/my-hub/read-record');
  if (twoGoals) fixtures['/goals'].push({ id: '9223372036854775802', title: '第二个目标', type: 1, status: 'in_progress', isPinned: 1 });
  if (goalCount) fixtures['/goals'] = Array.from({ length: goalCount }, (_, i) => ({ id: '922337203685477580' + i, title: '模拟目标 ' + (i + 1), type: 1, status: 'in_progress', isPinned: 1, targetValue: 100, currentValue: 27, endDate: '2029-09-06' }));
  if (anniversaryCount) fixtures['/anniversaryRecords'] = Array.from({ length: anniversaryCount }, (_, i) => ({ id: '922337203685477570' + i, title: '模拟纪念日 ' + (i + 1), isPinned: 1, icon: '🎉', targetDate: '2027-01-01' }));
  for (const [path, data] of Object.entries(fixtures)) {
    const respond = route => { requests.push(route.request().method() + ' ' + path); return route.fulfill({ json: { code: 0, data } }); };
    await page.route('**/api' + path, respond);
    await page.route('**/api' + path + '?*', respond);
  }
  let failures = failMore ? 1 : 0;
  await page.route('**/api/read-record/page?*', async route => {
    const current = Number(new URL(route.request().url()).searchParams.get('current'));
    calls.push(current);
    if (current === 2 && failures-- > 0) return route.fulfill({ status: 503, body: 'unavailable' });
    const all = Array.from({ length: 23 }, (_, i) => ({ id: String(i + 1), title: '阅读条目 ' + (i + 1), status: i < 20 ? 'in_progress' : 'not_started', totalProgress: 100, currentProgress: 30 }));
    return route.fulfill({ json: { code: 0, data: { items: all.slice((current - 1) * 20, current * 20), total: 23 } } });
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-home-business' })));
  if (!navigate) return calls;
  await page.goto('/#/pages/home/index');
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText(goalCount ? '模拟目标 1' : '固定目标');
  return calls;
}

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页准备请求延迟时业务卡片显示骨架 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const calls = await setup(page, { navigate: false });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/user/info', async route => {
      await pending;
      await route.fulfill({ json: { code: 0, data: { id: 'fixture-user', nickname: '测试用户' } } });
    });
    try {
      await page.goto('/#/pages/home/index');
      const cards = page.locator('.business-card');
      await expect(cards).toHaveCount(5);
      await page.locator('[aria-label="目标首页卡片"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('preparing.png'), fullPage: true });
      await expect(cards.locator('.business-skeleton')).toHaveCount(3);
      await expect(cards.locator('.movie-pending .movie-cell')).toHaveCount(6);
      await expect(cards.locator('.reading-placeholder')).toHaveCount(3);
      await expect(page.locator('.business-card[aria-busy="true"]')).toHaveCount(5);
      expect(calls).toEqual([]);
      release();
      await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
      await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(20);
      await expect(cards).toHaveCount(2);
      expect(calls).toEqual([1]);
      await page.screenshot({ path: info.outputPath('loaded.png'), fullPage: true });
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

test('首页准备请求失败时不残留标题空壳，重试后恢复业务卡片', async ({ page }) => {
  await setup(page, { navigate: false });
  let fail = true;
  await page.route('**/api/user/info', route => route.fulfill({ json: fail
    ? { code: 1, message: '模拟用户信息加载失败' }
    : { code: 0, data: { id: 'fixture-user', nickname: '测试用户' } }
  }));
  await page.goto('/#/pages/home/index');
  await expect(page.getByRole('alert')).toContainText('模拟用户信息加载失败');
  await expect(page.locator('.business-card')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
  await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(20);
});

test('短时间返回首页保留业务内容和分页，不重新请求或出现骨架', async ({ page }) => {
  const calls = await setup(page);
  await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(20);
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.getByRole('button', { name: '关于', exact: true }).click();
  await expect(page).toHaveURL(/pages\/about\/index/);
  let profiles = 0;
  await page.route('**/api/user/info', route => {
    profiles++;
    return route.fulfill({ json: { code: 0, data: { id: 'fixture-user', nickname: '测试用户' } } });
  });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page).toHaveURL(/pages\/profile\/index/);
  const profilesBeforeHome = profiles;
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('固定目标');
  await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(20);
  await expect(page.locator('.business-card .business-skeleton, .reading-placeholder')).toHaveCount(0);
  expect(calls).toEqual([1]);
  expect(profiles).toBe(profilesBeforeHome);
});

test('首页卡片保留分页失败数据，实际滚动触发、重试同页并在末页停止', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await setup(page, { failMore: true });
  const read = page.locator('[aria-label="阅读首页卡片"]');
  await expect(read.locator('.reading-book')).toHaveCount(20);
  await read.scrollIntoViewIfNeeded();
  const scroll = read.locator('.reading-scroll .uni-scroll-view-scrollbar-hidden').first();
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(read.getByRole('button', { name: '重试阅读', exact: true })).toBeVisible();
  await expect(read.locator('.reading-book')).toHaveCount(20);
  await read.getByRole('button', { name: '重试阅读', exact: true }).click();
  await expect(read.locator('.reading-book')).toHaveCount(23);
  await expect(read.locator('.reading-status-group').first()).toHaveAttribute('aria-label', '在读');
  await expect(read.locator('.reading-status-group').last()).toHaveAttribute('aria-label', '想读');
  await expect(read).not.toContainText('阅读条目');
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
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
  await expect(read.locator('.reading-book')).toHaveCount(0);
  expect(calls).toEqual([]);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});


test('没有授权菜单的卡片不发业务请求', async ({ page }) => {
  const calls = await setup(page, { readAccess: false });
  await expect(page.locator('[aria-label="阅读首页卡片"]')).toHaveCount(0);
  expect(calls).toEqual([]);
});

async function dragPinned(page, card, from, to, { hold = true, cancel = false } = {}) {
  const start = await card.locator('.business-row').nth(from).boundingBox();
  const end = await card.locator('.business-row').nth(to).boundingBox();
  const client = await page.context().newCDPSession(page);
  const x = start.x + start.width / 2, y = start.y + start.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (hold) {
    await expect(card.locator('.business-dragging')).toHaveCount(1);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: end.y + end.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await client.detach();
}

test('首页目标长按拖动保存字符串顺序，短滑和取消不排序且拖后不误开弹窗', async ({ page }) => {
  await setup(page, { twoGoals: true });
  const orders = [];
  await page.route('**/api/goals/pinned-order', async route => {
    orders.push(route.request().postDataJSON());
    await route.fulfill({ json: { code: 0, data: null } });
  });
  const card = page.locator('[aria-label="目标首页卡片"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button', { name: /固定操作/ })).toHaveCount(0);
  await dragPinned(page, card, 0, 1, { hold: false });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(orders).toEqual([]);
  await dragPinned(page, card, 0, 1, { cancel: true });
  expect(orders).toEqual([]);
  await dragPinned(page, card, 1, 0);
  await expect.poll(() => orders).toEqual([{ ids: ['9223372036854775802', '9223372036854775801'] }]);
  await expect(card.locator('.record-title').first()).toHaveText('第二个目标');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
});

test('首页目标排序失败恢复原顺序，可再次拖动保存', async ({ page }) => {
  await setup(page, { twoGoals: true });
  let fail = true, requests = 0;
  await page.route('**/api/goals/pinned-order', async route => {
    requests++;
    await route.fulfill({ json: fail ? { code: 1, message: '模拟排序失败' } : { code: 0, data: null } });
  });
  const card = page.locator('[aria-label="目标首页卡片"]');
  await card.scrollIntoViewIfNeeded();
  await dragPinned(page, card, 1, 0);
  await expect(card.getByRole('button', { name: '重试目标：模拟排序失败', exact: true })).toBeVisible();
  await expect(card.locator('.record-title').first()).toHaveText('固定目标');
  fail = false;
  await dragPinned(page, card, 1, 0);
  await expect(card.locator('.record-title').first()).toHaveText('第二个目标');
  await expect.poll(() => requests).toBe(2);
});

test('首页目标直接弹窗编辑、新增和取消固定，保存失败保留输入且成功局部更新', async ({ page }) => {
  await setup(page, { twoGoals: true });
  let fail = true, written;
  await page.route('**/api/goals', async route => {
    written = route.request().postDataJSON();
    await route.fulfill({ json: fail ? { code: 1, message: '模拟保存失败' } : { code: 0, data: { ...written, id: written.id || '9223372036854775803' } } });
  });
  const card = page.locator('[aria-label="目标首页卡片"]');
  await card.getByRole('button', { name: '编辑固定目标', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑目标', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
  await dialog.locator('[aria-label="标题"] input').fill('更新目标');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toContainText('模拟保存失败');
  await expect(dialog.locator('[aria-label="标题"] input')).toHaveValue('更新目标');
  fail = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText('更新目标');
  expect(written.id).toBe('9223372036854775801');
  expect(written.content).toBe('保留行动计划');
  expect(written.tags).toBe('["运动"]');
  await card.getByRole('button', { name: '编辑更新目标', exact: true }).click();
  await dialog.locator('uni-switch[aria-label="添加到首页"]').click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(card.locator('.business-row')).toHaveCount(1);
  expect(written.isPinned).toBe(0);
  await card.getByRole('button', { name: '新增目标', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.locator('[aria-label="标题"] input').fill('首页新目标');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(card).toContainText('首页新目标');
  expect(written.isPinned).toBe(1);
  await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
});

for (const kind of ['read', 'movie', 'member']) {
  test(`首页 ${kind} 条目在首页直接弹窗，保存后同步卡片`, async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await setup(page);
    const label = kind === 'read' ? '阅读' : kind === 'movie' ? '观影' : '会员';
    const base = kind === 'read' ? '/read-record' : kind === 'movie' ? '/movie' : '/membership';
    let row = kind === 'member'
      ? { id: '9223372036854775807', name: '首页编辑会员', provider: '测试平台', category: 'other', startDate: '2026-01-01', expiryDate: '2026-10-30', autoRenew: 1, billingCycle: 'month', monthlyAmount: 20, price: 20, note: '保留会员备注', color: '#722ed1' }
      : { id: '9223372036854775807', title: '首页编辑作品', type: 1, status: 'in_progress', totalProgress: 100, currentProgress: 30, author: '原作者', director: '原导演', remark: '保留完整详情备注', url: '', fileId: '', coverImgUrl: '' };
    let written;
    if (kind === 'member') {
      await page.route('**/api/membership/list', route => route.fulfill({ json: { code: 0, data: [row] } }));
      await page.route('**/api/membership/' + row.id, route => route.fulfill({ json: { code: 0, data: row } }));
      await page.route('**/api/membership/stats', route => route.fulfill({ json: { code: 0, data: {} } }));
      await page.route('**/api/membership/providers', route => route.fulfill({ json: { code: 0, data: [] } }));
    } else {
      await page.route('**/api' + base + '/page?*', route => {
        const activeOnly = new URL(route.request().url()).searchParams.get('activeOnly') === 'true';
        const items = !activeOnly || row.status !== 'completed' ? [row] : [];
        return route.fulfill({ json: { code: 0, data: { items, total: items.length } } });
      });
      await page.route('**/api' + base + '/' + row.id, route => route.fulfill({ json: { code: 0, data: row } }));
    }
    await page.route('**/api' + base, route => {
      written = route.request().postDataJSON();
      row = { ...row, ...written };
      return route.fulfill({ json: { code: 0, data: row } });
    });
    await page.reload();
    const card = page.locator(`[aria-label="${label}首页卡片"]`);
    await card.getByRole('button', { name: '编辑' + (row.title || row.name), exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
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
    await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
    if (kind === 'member') await expect(card).toContainText('2027-01-01');
    else { expect(written.status).toBe('completed'); await expect(card).toHaveCount(0); }
  });
}

test('成功写入后返回首页只更新受影响的目标卡片', async ({ page }) => {
  const requests = [];
  const reads = await setup(page, { requests });
  await expect(page.locator('[aria-label="阅读首页卡片"] .reading-book')).toHaveCount(20);
  let goal;
  await page.route('**/api/goals', async route => {
    goal = route.request().postDataJSON();
    return route.fulfill({ json: { code: 0, data: goal } });
  });
  await page.route('**/api/goals?*', route => {
    requests.push('GET /goals');
    return route.fulfill({ json: { code: 0, data: [goal] } });
  });
  const card = page.locator('[aria-label="目标首页卡片"]');
  await card.getByRole('button', { name: '编辑固定目标', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑目标', exact: true });
  await dialog.locator('[aria-label="标题"] input').fill('返回仍显示更新后的目标');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const count = path => requests.filter(item => item === 'GET ' + path).length;
  const before = Object.fromEntries(['/goals', '/user/info', '/dashboard/tasks', '/quick-nav/candidates'].map(path => [path, count(path)]));
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await page.getByRole('button', { name: '关于', exact: true }).click();
  await expect(page).toHaveURL(/pages\/about\/index/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect.poll(() => count('/goals')).toBe(before['/goals'] + 1);
  await expect(card).toContainText('返回仍显示更新后的目标');
  await expect(page.locator('.business-card .business-skeleton')).toHaveCount(0);
  // 通过个人页离开/返回会读取用户信息；首页仍只更新受影响业务区域。
  for (const path of ['/dashboard/tasks', '/quick-nav/candidates']) expect(count(path)).toBe(before[path]);
  expect(reads).toEqual([1]);
});


test('菜单依赖刷新失败保留已展示目标和阅读，局部重试恢复', async ({ page }) => {
  await page.setViewportSize({width:390,height:1000});
  await setup(page);
  const goal=page.locator('[aria-label="目标首页卡片"]');
  const reading=page.locator('[aria-label="阅读首页卡片"]');
  await expect(reading.locator('.reading-book')).toHaveCount(20);
  await page.route('**/api/quick-nav/candidates?*', route => route.fulfill({status:503,body:'offline'}));
  await page.locator('.dashboard-scroll .uni-scroll-view-scrollbar-hidden').first().evaluate(el=>{el.scrollTop=0});
  await pullDown(page,'.dashboard-scroll');
  await expect(goal.getByRole('button',{name:/^重试目标：/})).toBeVisible();
  await expect(goal).toContainText('固定目标');
  await expect(reading.locator('.reading-book')).toHaveCount(20);
  await goal.getByRole('button',{name:/^重试目标：/}).click();
  await expect(goal.getByRole('button',{name:/^重试目标：/})).toHaveCount(0);
  await expect(goal).toContainText('固定目标');
});


// 真实触摸连续移动、越界及取消，检查截图中空白/裁切对应的行距和滚动范围。
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`目标连续拖动和纪念日滑动后布局稳定 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, { twoGoals: true, anniversaryCount: 5 });
    const orders = [];
    await page.route('**/api/goals/pinned-order', route => {
      orders.push(route.request().postDataJSON());
      return route.fulfill({ json: { code: 0, data: null } });
    });
    const goal = page.locator('[aria-label="目标首页卡片"]');
    const anniversary = page.locator('[aria-label="纪念日首页卡片"]');
    await goal.scrollIntoViewIfNeeded();
    const size = await goal.boundingBox();
    const scroll = goal.locator('.uni-scroll-view-scrollbar-hidden').first();
    const cdp = await page.context().newCDPSession(page);
    const box = await goal.locator('.business-row').last().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    for (const cancel of [true, false]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await expect(goal.locator('.business-dragging')).toHaveCount(1);
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 20 }] });
      }
      await expect.poll(() => goal.locator('.business-dragging').evaluate(el => Number(new DOMMatrix(getComputedStyle(el).transform).m42))).toBe(-64);
      expect((await goal.boundingBox()).height).toBe(size.height);
      expect(await scroll.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
      await page.screenshot({ path: info.outputPath(cancel ? 'drag-cancel.png' : 'drag.png') });
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await expect(goal.locator('.business-dragging')).toHaveCount(0);
      const rows = await goal.locator('.business-row').evaluateAll(nodes => nodes.map(el => ({ y: el.getBoundingClientRect().y, height: el.getBoundingClientRect().height, offset: new DOMMatrix(getComputedStyle(el).transform).m42 })));
      expect(rows.every(row => row.height === 64 && row.offset === 0)).toBe(true);
      expect(rows[1].y - rows[0].y).toBe(64);
      expect((await goal.boundingBox()).height).toBe(size.height);
      if (cancel) expect(orders).toEqual([]);
    }
    await expect.poll(() => orders.length).toBe(1);
    await expect(goal.locator('.record-title').first()).toHaveText('第二个目标');
    await anniversary.scrollIntoViewIfNeeded();
    const anniversarySize = await anniversary.boundingBox();
    const a = await anniversary.locator('.business-row').nth(1).boundingBox();
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ax, y: ay - i * 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const anniversaryScroll = anniversary.locator('.uni-scroll-view-scrollbar-hidden').first();
    await expect.poll(() => anniversaryScroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect((await anniversary.boundingBox()).height).toBe(anniversarySize.height);
    const rowYs = await anniversary.locator('.business-row').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().y));
    expect(rowYs.slice(1).every((y, i) => y - rowYs[i] === 64)).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('settled.png') });
    await cdp.detach();
  });
}

test('目标拖动到边缘自动滚动，移动到末项只保存一次且松手后恢复滚动范围', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await setup(page, { goalCount: 6, anniversaryCount: 1 });
  const orders = [];
  await page.route('**/api/goals/pinned-order', route => {
    orders.push(route.request().postDataJSON());
    return route.fulfill({ json: { code: 0, data: null } });
  });
  const goal = page.locator('[aria-label="目标首页卡片"]');
  await goal.scrollIntoViewIfNeeded();
  const scroll = goal.locator('.uni-scroll-view-scrollbar-hidden').first();
  const viewport = await goal.locator('.business-scroll').boundingBox();
  const first = await goal.locator('.business-row').first().boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = first.x + first.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: first.y + first.height / 2 }] });
  await expect(goal.locator('.business-dragging')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: viewport.y + viewport.height - 5 }] });
  const maxScroll = await scroll.evaluate(el => el.scrollHeight - el.clientHeight);
  expect(maxScroll).toBeGreaterThan(0);
  await expect.poll(() => scroll.evaluate(el => el.scrollTop), { timeout: 5000 }).toBe(maxScroll);
  expect(orders).toEqual([]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0].ids).toEqual(['9223372036854775801', '9223372036854775802', '9223372036854775803', '9223372036854775804', '9223372036854775805', '9223372036854775800']);
  expect(await scroll.evaluate(el => el.scrollHeight)).toBe(6 * 64);
  await expect(goal.locator('.record-title').last()).toHaveText('模拟目标 1');
  await cdp.detach();
});


for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`纪念日长按排序支持取消、失败恢复且不干扰目标 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, { twoGoals: true, anniversaryCount: 2 });
    let fail = true;
    const orders = [], goalOrders = [];
    await page.route('**/api/anniversaryRecords/pinned-order', route => {
      orders.push(route.request().postDataJSON());
      return route.fulfill({ json: fail ? { code: 1, message: '模拟纪念日排序失败' } : { code: 0, data: null } });
    });
    await page.route('**/api/goals/pinned-order', route => {
      goalOrders.push(route.request().postDataJSON());
      return route.fulfill({ json: { code: 0, data: null } });
    });
    const card = page.locator('[aria-label="纪念日首页卡片"]');
    await card.scrollIntoViewIfNeeded();
    const initialHeight = (await card.boundingBox()).height;
    await dragPinned(page, card, 1, 0, { hold: false });
    expect(orders).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await dragPinned(page, card, 1, 0, { cancel: true });
    expect(orders).toEqual([]);
    await expect(card.locator('.record-title').first()).toHaveText('模拟纪念日 1');
    await dragPinned(page, card, 1, 0);
    await expect(card.getByRole('button', { name: '重试纪念日：模拟纪念日排序失败', exact: true })).toBeVisible();
    await expect(card.locator('.record-title').first()).toHaveText('模拟纪念日 1');
    fail = false;
    await dragPinned(page, card, 1, 0);
    await expect(card.locator('.record-title').first()).toHaveText('模拟纪念日 2');
    await expect.poll(() => orders.length).toBe(2);
    expect(orders.every(order => JSON.stringify(order.ids) === JSON.stringify(['9223372036854775701', '9223372036854775700']))).toBe(true);
    expect(goalOrders).toEqual([]);
    await expect(page.locator('[aria-label="目标首页卡片"] .record-title').first()).toHaveText('固定目标');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const geometry = await card.locator('.business-row').evaluateAll(nodes => nodes.map(el => ({ y: el.getBoundingClientRect().y, height: el.getBoundingClientRect().height, offset: new DOMMatrix(getComputedStyle(el).transform).m42 })));
    expect(geometry.every(row => row.height === 64 && row.offset === 0)).toBe(true);
    expect(geometry[1].y - geometry[0].y).toBe(64);
    expect((await card.boundingBox()).height).toBe(initialHeight);
    await page.screenshot({ path: info.outputPath('anniversary-sorted.png') });
    // 拖动的误点抑制结束后仍可正常轻点编辑。
    await page.waitForTimeout(460);
    await page.route('**/api/anniversaryRecords/9223372036854775701', route => route.fulfill({ json: { code: 0, data: { id: '9223372036854775701', title: '模拟纪念日 2', isPinned: 1, targetDate: '2027-01-01', icon: '🎉' } } }));
    await card.getByRole('button', { name: '编辑模拟纪念日 2', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑纪念日', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
  });
}

test('纪念日拖动到边缘自动滚动，松手仅保存纪念日顺序', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await setup(page, { twoGoals: true, anniversaryCount: 6 });
  const orders = [];
  await page.route('**/api/anniversaryRecords/pinned-order', route => {
    orders.push(route.request().postDataJSON());
    return route.fulfill({ json: { code: 0, data: null } });
  });
  const card = page.locator('[aria-label="纪念日首页卡片"]');
  await card.scrollIntoViewIfNeeded();
  const viewport = await card.locator('.business-scroll').boundingBox();
  const first = await card.locator('.business-row').first().boundingBox();
  const scroll = card.locator('.uni-scroll-view-scrollbar-hidden').first();
  const cdp = await page.context().newCDPSession(page);
  const x = first.x + first.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: first.y + first.height / 2 }] });
  await expect(card.locator('.business-dragging')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: viewport.y + viewport.height - 5 }] });
  const maxScroll = await scroll.evaluate(el => el.scrollHeight - el.clientHeight);
  expect(maxScroll).toBeGreaterThan(0);
  await expect.poll(() => scroll.evaluate(el => el.scrollTop), { timeout: 5000 }).toBe(maxScroll);
  expect(orders).toEqual([]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0].ids).toEqual(['9223372036854775701', '9223372036854775702', '9223372036854775703', '9223372036854775704', '9223372036854775705', '9223372036854775700']);
  expect(await scroll.evaluate(el => el.scrollHeight)).toBe(6 * 64);
  await expect(card.locator('.record-title').last()).toHaveText('模拟纪念日 1');
  await cdp.detach();
});
