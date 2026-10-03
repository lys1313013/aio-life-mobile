const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');

async function setup(page) {
  const state = { calls: {}, writes: [], failSave: false, failTypes: false, failThought: false, holdSave: null, holdTypes: null };
  state.thought = { id: '1', content: '模拟完整闪念', isPinned: 1, hiddenContent: true, events: [{ id: '9223372036854775807', content: '原有关联事件', create_time: '2026-10-03 08:00:00' }] };
  state.task = { id: '9223372036854775806', taskId: '9223372036854775805', content: '模拟关注待办', priority: 20, isCompleted: 0, isStarred: 1, startTime: '2026-10-03 09:00:00', endTime: '2026-10-03 10:00:00' };
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls[path] = (state.calls[path] || 0) + 1;
    let data = dashboardFixture(path) ?? [];
    if (path === '/api/auth/login') data = { accessToken: 'home-create-fixture' };
    if (path === '/api/user/info') data = { id: '1', nickname: '模拟用户' };
    if (path === '/api/taskDetails/watched') data = [state.task];
    if (path === '/api/thought/query') {
      if (state.failThought) return route.fulfill({ json: { rscode: '1', result: '模拟闪念加载失败' } });
      data = { items: [state.thought], total: '1' };
    }
    if (path === '/api/userDictType/getByDictType') {
      if (state.holdTypes) await state.holdTypes;
      if (state.failTypes) return route.fulfill({ json: { rscode: '1', result: '模拟类型加载失败' } });
      data = { dictDetailList: [{ id: '9223372036854775807', dictLabel: '跑步' }] };
    }
    if ((request.method() === 'POST' && ['/api/thought', '/api/exerciseRecord'].includes(path)) ||
      (request.method() === 'PUT' && ['/api/thought/1', '/api/taskDetails'].includes(path)) ||
      (request.method() === 'POST' && path.startsWith('/api/taskDetails/unstar/'))) {
      state.writes.push({ path, body: request.postDataJSON() });
      if (state.holdSave) await state.holdSave;
      if (state.failSave) return route.fulfill({ json: { rscode: '1', result: '模拟保存失败' } });
      data = true;
    }
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.exercise-main').first()).toBeAttached();
  await expect(page.locator('.overview-card .card-progress')).toHaveCount(0);
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页直接新增并局部刷新 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page), home = page.url();
    const before = { ...state.calls };
    await page.getByRole('button', { name: '新增闪念', exact: true }).click();
    const thought = page.getByRole('dialog', { name: '新增闪念', exact: true });
    await expect(thought).toBeVisible();
    await expect(page).toHaveURL(home);
    await thought.getByRole('textbox', { name: '内容', exact: true }).fill('模拟首页闪念');
    await thought.getByRole('button', { name: '新增关联事件' }).click();
    await thought.getByRole('textbox', { name: '关联事件 1' }).fill('模拟关联事件');
    await thought.getByRole('button', { name: '展示到看板', exact: true }).click();
    await page.screenshot({ path: info.outputPath('thought.png') });
    await thought.getByRole('button', { name: '保存', exact: true }).click();
    await expect(thought).toHaveCount(0);
    await expect.poll(() => state.calls['/api/thought/dashboard']).toBe(before['/api/thought/dashboard'] + 1);
    expect(state.writes[0]).toEqual({ path: '/api/thought', body: { content: '模拟首页闪念', isPinned: 1, events: [{ content: '模拟关联事件' }] } });
    await page.getByRole('button', { name: '新增运动', exact: true }).click();
    const exercise = page.getByRole('dialog', { name: '新增运动记录' });
    await expect(exercise).toBeVisible();
    await expect(exercise.locator('.form-field-picker-value').first()).toHaveText('跑步');
    await exercise.getByRole('spinbutton', { name: '运动数量' }).fill('12');
    await exercise.getByRole('textbox', { name: '备注' }).fill('模拟运动备注');
    await page.screenshot({ path: info.outputPath('exercise.png') });
    const bounds = await exercise.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await exercise.getByRole('button', { name: '保存', exact: true }).click();
    await expect(exercise).toHaveCount(0);
    await expect(page).toHaveURL(home);
    await expect.poll(() => state.calls['/api/exerciseRecord/dashboardSummary']).toBe(before['/api/exerciseRecord/dashboardSummary'] + 1);
    await expect.poll(() => state.calls['/api/dashboard/card/EXERCISE']).toBe(before['/api/dashboard/card/EXERCISE'] + 1);
    expect(state.writes[1].body).toMatchObject({ exerciseTypeId: '9223372036854775807', exerciseCount: 12, description: '模拟运动备注' });
    expect(state.writes[1].body.exerciseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const path of ['/api/dashboard/tasks', '/api/timeRecord/query', '/api/taskDetails/watched']) expect(state.calls[path]).toBe(before[path]);
    expect(state.calls['/api/thought/query']).toBeUndefined();
    expect(state.calls['/api/exerciseRecord/query']).toBeUndefined();
  });
}

test('首页新增校验、失败保留、重复提交保护及取消后重开', async ({ page }) => {
  const state = await setup(page), home = page.url();
  await page.getByRole('button', { name: '新增闪念', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText('请输入内容', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole('textbox', { name: '内容', exact: true }).fill('保留草稿');
  state.failSave = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText('模拟保存失败')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: '内容', exact: true })).toHaveValue('保留草稿');
  state.failSave = false;
  let release;
  state.holdSave = new Promise(resolve => { release = resolve; });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  release();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '新增闪念', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '内容', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(home);
  expect(state.writes).toHaveLength(2);
});

test('运动弹窗立即打开，类型加载失败可重试，保存失败保留数量', async ({ page }) => {
  const state = await setup(page);
  let release;
  state.holdTypes = new Promise(resolve => { release = resolve; });
  state.failTypes = true;
  await page.getByRole('button', { name: '新增运动', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增运动记录' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status', { name: '正在加载运动类型' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  release();
  await expect(dialog.getByText('模拟类型加载失败')).toBeVisible();
  state.failTypes = false;
  await dialog.getByRole('button', { name: '重试运动类型' }).click();
  await expect(dialog.locator('.form-field-picker-value').first()).toHaveText('跑步');
  await dialog.getByRole('spinbutton', { name: '运动数量' }).fill('-1');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText('运动数量必须为非负整数')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole('spinbutton', { name: '运动数量' }).fill('10');
  state.failSave = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByText('模拟保存失败')).toBeVisible();
  await expect(dialog.getByRole('spinbutton', { name: '运动数量' })).toHaveValue('10');
  state.failSave = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页条目原地编辑并保留完整字段 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page), home = page.url(), before = { ...state.calls };
    await page.getByRole('button', { name: '编辑闪念', exact: true }).first().click();
    const thought = page.getByRole('dialog', { name: '编辑闪念', exact: true });
    await expect(thought.getByRole('textbox', { name: '内容', exact: true })).toHaveValue(state.thought.content);
    await expect(thought.getByRole('textbox', { name: '关联事件 1' })).toHaveValue('原有关联事件');
    await expect(page).toHaveURL(home);
    await thought.getByRole('textbox', { name: '内容', exact: true }).fill('已编辑的模拟闪念');
    await thought.getByRole('button', { name: '显示内容', exact: true }).click();
    for (const name of ['删除闪念', '新增关联事件', '隐藏内容', '取消看板展示']) {
      await expect(thought.getByRole('button', { name, exact: true })).toBeInViewport();
    }
    await page.screenshot({ path: info.outputPath('thought-edit.png') });
    await thought.getByRole('button', { name: '保存', exact: true }).click();
    await expect(thought).toHaveCount(0);
    await expect(page.getByText('已编辑的模拟闪念', { exact: true })).toBeVisible();
    expect(state.writes[0]).toEqual({ path: '/api/thought/1', body: {
      content: '已编辑的模拟闪念', isPinned: 1, hiddenContent: false,
      events: [{ id: '9223372036854775807', content: '原有关联事件' }],
    } });
    expect(state.calls['/api/thought/dashboard']).toBe(before['/api/thought/dashboard']);

    await page.getByRole('button', { name: '编辑待办 模拟关注待办', exact: true }).click();
    const task = page.getByRole('dialog', { name: '编辑待办', exact: true });
    await expect(task).toBeVisible();
    await expect(task.getByText('2026-10-03', { exact: true })).toHaveCount(2);
    await expect(task.getByText('09:00', { exact: true })).toBeVisible();
    await expect(task.getByText('10:00', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(home);
    await task.getByRole('textbox', { name: '内容', exact: true }).fill('已编辑的模拟待办');
    await page.screenshot({ path: info.outputPath('task-edit.png') });
    const bounds = await task.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await task.getByRole('button', { name: '取消关注', exact: true }).click();
    await task.getByRole('button', { name: '保存', exact: true }).click();
    await expect(task).toHaveCount(0);
    await expect(page.getByRole('button', { name: '编辑待办 已编辑的模拟待办', exact: true })).toHaveCount(0);
    expect(state.writes[1]).toEqual({ path: '/api/taskDetails', body: {
      id: state.task.id, taskId: state.task.taskId, content: '已编辑的模拟待办', priority: 20,
      startTime: state.task.startTime, endTime: state.task.endTime,
    } });
    expect(state.writes[2].path).toBe('/api/taskDetails/unstar/' + state.task.id);
    for (const path of ['/api/dashboard/tasks', '/api/timeRecord/query', '/api/taskDetails/watched']) expect(state.calls[path]).toBe(before[path]);
    expect(state.calls['/api/tasks']).toBeUndefined();
    await expect(page).toHaveURL(home);
  });
}

test('首页编辑加载失败可重试，保存失败保留草稿，取消不写入', async ({ page }) => {
  const state = await setup(page), home = page.url();
  state.failThought = true;
  await page.getByRole('button', { name: '编辑闪念', exact: true }).first().click();
  const thought = page.getByRole('dialog', { name: '编辑闪念', exact: true });
  await expect(thought.getByText('模拟闪念加载失败')).toBeVisible();
  await expect(thought.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  state.failThought = false;
  await thought.getByRole('button', { name: '重试加载闪念' }).click();
  await thought.getByRole('textbox', { name: '内容', exact: true }).fill('失败时保留的草稿');
  state.failSave = true;
  await thought.getByRole('button', { name: '保存', exact: true }).click();
  await expect(thought.getByText('模拟保存失败')).toBeVisible();
  await expect(thought.getByRole('textbox', { name: '内容', exact: true })).toHaveValue('失败时保留的草稿');
  await thought.getByRole('button', { name: '取消', exact: true }).click();
  await expect(thought).toHaveCount(0);
  await page.getByRole('button', { name: '编辑待办 模拟关注待办', exact: true }).click();
  const task = page.getByRole('dialog', { name: '编辑待办', exact: true });
  await task.getByRole('textbox', { name: '内容', exact: true }).fill('取消的草稿');
  await task.getByRole('button', { name: '取消', exact: true }).click();
  expect(state.writes).toHaveLength(1);
  await expect(page.getByRole('button', { name: '编辑待办 模拟关注待办', exact: true })).toBeVisible();
  await expect(page).toHaveURL(home);
});
