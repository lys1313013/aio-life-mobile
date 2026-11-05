const { test, expect } = require('./support/test');
const fs = require('node:fs');
const path = require('node:path');
const examples = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/goal-queries.json'), 'utf8')).map((config, i) => ({
  ...config,
  id: ['9223372036854775801', '9223372036854775802', '9223372036854775803'][i],
  isPinned: 1,
}));
const reply = data => ({ json: { code: 0, message: null, data } });
async function setup(page, apiMock) {
  const rows = examples.map(row => ({ ...row }));
  const state = { previewCalls: [], writes: [], refreshCalls: [], failRefresh: false, holdRefresh: null, previewFail: false };
  apiMock({
    'GET /api/user/info': reply({ id: '101', nickname: '模拟用户' }),
    'GET /api/auth/secondary-lock/menus': reply([]),
    'GET /api/menu/visuals': reply({ menus: [], cards: {} }),
    'GET /api/goals': () => reply(rows),
    'POST /api/goals/progress/refresh': async req => {
      state.refreshCalls.push(req.postDataJSON());
      if (state.holdRefresh) await state.holdRefresh;
      const data = rows.filter(row => req.postDataJSON().ids.includes(row.id)).map((row, i) => ({ ...row, currentValue: [26,25,15000][rows.indexOf(row)], progressCheckedAt: '2026-11-03 10:00:00', ...(state.failRefresh ? { progressError: '模拟查询失败' } : {}) }));
      return reply(data);
    },
    'POST /api/goals/progress/preview': req => {
      state.previewCalls.push(req.postDataJSON());
      if (state.previewFail) return { json: { code: 1, message: '模拟预览失败' } };
      return reply({ currentValue: 25, achieved: false, progressPercent: 31, variables: { start: '2026-01-01', end: '2027-01-01', category: '1' } });
    },
    'PUT /api/goals': req => {
      const body = req.postDataJSON(); state.writes.push(body);
      const row = rows.find(row => row.id === body.id); Object.assign(row, body);
      return reply(row);
    },
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-goal-progress' })));
  await page.goto('/#/pages/tasks/goals');
  await expect(page.getByRole('button', { name: '编辑目标：' + rows[0].title, exact: true })).toContainText('65%');
  return { state, rows };
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`GraphQL目标三场景、配置预览与保存 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const { state, rows } = await setup(page, apiMock);
    const cards = page.locator('.record-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(1)).toContainText('31%');
    await expect(cards.nth(2)).toContainText('100%');
    await expect(cards.nth(2)).toContainText('已完成');
    await page.screenshot({ path: info.outputPath('goals.png'), fullPage: true });
    await page.getByRole('button', { name: '编辑目标：' + rows[1].title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑目标', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'GraphQL 查询', exact: true })).toHaveValue(rows[1].progressQuery);
    await expect(dialog.getByRole('textbox', { name: '结果路径', exact: true })).toHaveValue('progress.date.countDistinct');
    await expect(dialog.getByRole('textbox', { name: '当前值', exact: true })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: '固定变量 JSON', exact: true }).fill('{bad');
    await dialog.getByRole('button', { name: '执行预览', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('变量 JSON 格式错误');
    expect(state.previewCalls).toHaveLength(0);
    await dialog.getByRole('textbox', { name: '固定变量 JSON', exact: true }).fill(rows[1].progressVariables);
    state.previewFail = true;
    await dialog.getByRole('button', { name: '执行预览', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('模拟预览失败');
    state.previewFail = false;
    await dialog.getByRole('button', { name: '执行预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('当前值 25');
    await expect(dialog.getByRole('status')).toContainText('2027-01-01');
    await page.screenshot({ path: info.outputPath('query-editor.png'), fullPage: true });
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(state.writes[0]).toMatchObject({ id: rows[1].id, progressMode: 'graphql', progressQuery: rows[1].progressQuery, progressValuePath: 'progress.date.countDistinct', targetOperator: 'gt' });
    expect(state.writes[0].currentValue).toBeUndefined();
    expect(JSON.parse(state.writes[0].progressVariables).category).toBe('1');
    await expect(cards.nth(1)).toContainText('31%');
  });
}

test('刷新保留已有进度和卡片高度，查询失败后可重试', async ({ page, apiMock }) => {
  const { state } = await setup(page, apiMock);
  const cards = page.locator('.record-card');
  const before = await cards.evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })));
  let release;
  state.holdRefresh = new Promise(resolve => { release = resolve; });
  const previous = state.refreshCalls.length;
  await page.getByRole('button', { name: '搜索目标', exact: true }).click();
  await expect.poll(() => state.refreshCalls.length).toBe(previous + 1);
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('65%');
  const during = await cards.evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })));
  expect(during).toEqual(before);
  state.failRefresh = true; release(); state.holdRefresh = null;
  await expect(cards.nth(0)).toContainText('模拟查询失败');
  await expect(cards.nth(0)).toContainText('65%');
  await expect(cards.nth(2)).toContainText('已完成');
  state.failRefresh = false;
  await page.getByRole('button', { name: '搜索目标', exact: true }).click();
  await expect(page.getByText('模拟查询失败')).toHaveCount(0);
  await expect(cards.nth(2)).toContainText('100%');
});

test('查询预览不要求先填写目标标题', async ({ page, apiMock }) => {
  const { state, rows } = await setup(page, apiMock);
  await page.getByRole('button', { name: '编辑目标：' + rows[1].title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑目标', exact: true });
  await dialog.getByRole('textbox', { name: '标题', exact: true }).fill('');
  await dialog.getByRole('button', { name: '执行预览', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('当前值 25');
  expect(state.previewCalls).toHaveLength(1);
  expect(state.writes).toHaveLength(0);
});
