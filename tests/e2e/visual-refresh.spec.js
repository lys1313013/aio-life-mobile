const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const fs = require('node:fs');

const output = 'artifacts/web-parity-visual-refresh';
const longId = '9223372036854775807';
async function subscriptions(page) {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
  await setup(page);
  const state = {
    fail: false,
    writes: [],
    rows: [
      { id: '41', name: '模拟过期订阅', status: 'expired', remainingDays: -30, category: 'study', expiryDate: '2026-09-01' },
      { id: longId, name: '模拟即将到期订阅', status: 'expiring', remainingDays: 3, category: 'video', expiryDate: '2026-10-04', note: '模拟备注，保存后应保留' },
      { id: '43', name: '模拟音乐订阅', status: 'active', remainingDays: 80, category: 'music', expiryDate: '2026-12-20' },
      { id: '44', name: '模拟名称特别长的家庭共享影音年度订阅', status: 'active', remainingDays: 40, category: 'video', expiryDate: '2026-11-10' },
      { id: '45', name: '模拟第二个过期订阅', status: 'expired', remainingDays: -15, category: 'cloud', expiryDate: '2026-09-16' },
      { id: '46', name: '模拟云盘订阅', status: 'active', remainingDays: 60, category: 'cloud', expiryDate: '2026-11-30' },
    ].map((row) => ({ startDate: '2026-01-01', price: 99, monthlyAmount: 8.25, billingCycle: 'year', provider: '模拟平台', autoRenew: 0, color: '#1677ff', ...row })),
  };
  await page.route('**/api/membership/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/stats')
      ? { activeCount: 3, expiringCount: 1, expiringThisMonthCount: 1, monthlyAmount: 33 }
      : state.rows;
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.route('**/api/membership', (route) => {
    const body = route.request().postDataJSON();
    state.writes.push({ method: route.request().method(), body });
    if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟保存失败，请重试' } });
    const index = state.rows.findIndex((row) => row.id === body.id);
    state.rows[index] = { ...state.rows[index], ...body };
    return route.fulfill({ json: { code: 0, data: state.rows[index] } });
  });
  await page.goto('/#/pages/member/index');
  await expect(page.locator('.member-card')).toHaveCount(4);
  await page.getByRole('switch', { name: '包含过期', exact: true }).click();
  await expect(page.locator('.member-card')).toHaveCount(6);
  return state;
}

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`订阅紧凑卡片与长编辑表单 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const state = await subscriptions(page);
      fs.mkdirSync(output, { recursive: true });
      const cards = page.locator('.member-card');
      await expect(cards.first()).toContainText('模拟即将到期订阅');
      await expect(cards.nth(4)).toContainText('过期订阅');
      const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right };
      }));
      expect(boxes[1].y).toBeCloseTo(boxes[0].y, 0);
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${output}/member-${width}-${theme}.png`, fullPage: true });
      await cards.first().click();
      const dialog = page.getByRole('dialog', { name: '编辑订阅', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('模拟即将到期订阅');
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(901);
      await page.screenshot({ path: `${output}/member-${width}-${theme}-edit.png`, fullPage: true });
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(state.writes).toEqual([]);
    });
  }
}

test('订阅编辑失败恢复保留完整字段和长ID', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await subscriptions(page);
  await expect(page.locator('.member-card')).toHaveCount(6);
  await page.getByRole('button', { name: '编辑订阅：模拟即将到期订阅', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑订阅', exact: true });
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('模拟即将到期订阅更新');
  state.fail = true;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toContainText('模拟保存失败，请重试');
  await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('模拟即将到期订阅更新');
  state.fail = false;
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑订阅：模拟即将到期订阅更新', exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toMatchObject({ method: 'PUT', body: { id: longId, note: '模拟备注，保存后应保留', category: 'video', provider: '模拟平台', monthlyAmount: 8.25 } });
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`工具和反馈紧凑列表及详情 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page);
    const feedback = [0, 1, 2].map((i) => ({ id: String(70 + i), title: ['模拟建议：完善记录的筛选与统计', '模拟问题：长标题列表与触控区域验收', '模拟反馈：希望增加图表对比'][i], content: '模拟反馈正文，记录具体场景和期望行为。', feedbackType: ['SUGGESTION', 'BUG', 'QUESTION'][i], summary: '模拟反馈摘要，说明具体场景。', commentCount: i, status: ['PENDING', 'PROCESSING', 'RESOLVED'][i], createTime: '2026-10-01 12:00:00', comments: [], files: [] }));
    await page.route('**/api/feedback/my*', (route) => route.fulfill({ json: { code: 0, data: { items: feedback, total: feedback.length } } }));
    await page.route('**/api/feedback/my/*', (route) => route.fulfill({ json: { code: 0, data: feedback[0] } }));
    fs.mkdirSync(output, { recursive: true });
    for (const [route, action, dialogName] of [
      ['mcp/index', '输入参数并调用 fixture_tool', 'fixture_tool'],
      ['records/feedback', '反馈详情', '反馈详情'],
    ]) {
      await page.goto('/#/pages/' + route);
      const button = page.getByRole('button', { name: action, exact: true }).first();
      await expect(button).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const prefix = `${output}/${route.replace('/', '-')}-${width}-${theme}`;
      await page.screenshot({ path: prefix + '-page.png', fullPage: true });
      await button.click();
      const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(901);
      await page.screenshot({ path: prefix + '-detail.png', fullPage: true });
    }
  });
}
