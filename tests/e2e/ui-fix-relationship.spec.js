const { test, expect } = require('./support/test');
const { stableBox } = require('./support/geometry');
const { waitForMotion } = require('./support/motion');

const success = data => ({ json: { code: 0, message: null, data } });
const sessionFixtures = {
  'GET /api/auth/secondary-lock/menus': success([]),
  'GET /api/user/info': success({ id: '1', accountUsername: 'fixture', nickname: '模拟用户' }),
};
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

const person = {
  id: '9223372036854775801', name: '模拟人物甲', category: '社会',
  description: '一起学习的朋友', tags: '学习,运动', birthday: '1994-03-12',
  phone: '13800000000', email: 'example@example.com', undergraduateSchool: '模拟大学',
  socialLinks: 'https://example.com/profile', notes: '用于界面验证的模拟备注',
  relationships: [{
    id: '9223372036854775803', target: { id: '9223372036854775802', name: '模拟人物乙' },
    relationType: '朋友', direction: '双向', description: '模拟关系说明', tags: '同学',
  }, {
    id: '9223372036854775805', target: { id: '9223372036854775804', name: '用于验证长姓名换行和同行操作按钮的模拟人物' },
    relationType: '同学', direction: '单向', description: '这是一条用来检查窄屏换行和操作位置的模拟关系说明。'.repeat(3),
  }, {
    id: '9223372036854775807', target: { id: '9223372036854775806', name: '模拟人物丁' },
    relationType: '同事', direction: '双向',
  }],
};
const graph = {
  nodes: [{ id: person.id, name: person.name, category: person.category },
    ...person.relationships.map(item => ({ ...item.target, category: '社会' }))],
  edges: person.relationships.map(item => ({
    source: person.id, target: item.target.id, relationType: item.relationType, direction: item.direction,
  })),
};

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`relationship loading and detail at ${width} with app ${theme} opposite system`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await page.addInitScript(value => {
      localStorage.setItem('aio-life-mobile.access-token.v1', 'relationship-visual-fixture');
      localStorage.setItem('aio-life-mobile.theme.v1', value);
    }, theme);
    const initial = gate(), detail = gate();
    apiMock({
      ...sessionFixtures,
      'GET /api/relationships/graph': async () => { await initial.promise; return success(graph); },
      [`GET /api/relationships/persons/${person.id}`]: async () => { await detail.promise; return success(person); },
    });
    try {
      await page.goto('/#/pages/relationship/index');
      const canvas = page.locator('.topology');
      const search = page.getByRole('button', { name: '展开人物搜索', exact: true });
      const add = page.getByRole('button', { name: '新增人物', exact: true });
      const spinner = page.getByRole('status', { name: '正在加载关系图谱', exact: true }).locator('.loading-spinner');
      await expect(spinner).toBeVisible();
      await waitForMotion(page);
      const [bounds, searchBounds, addBounds] = await Promise.all([canvas, search, add].map(locator => stableBox(locator)));
      expect(await spinner.evaluate(element => element.offsetWidth)).toBeLessThanOrEqual(32);
      const ring = await spinner.boundingBox();
      expect(ring.x + ring.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 0);
      expect(ring.y + ring.height / 2).toBeCloseTo(bounds.y + bounds.height / 2, 0);
      await page.screenshot({ path: `artifacts/relationship-loading/loading-${width}-${theme}.png` });
      initial.release();
      await expect(spinner).toHaveCount(0);
      await expect(page.getByRole('button', { name: person.name, exact: true })).toBeVisible();
      expect(await stableBox(canvas)).toEqual(bounds);
      expect(await stableBox(search)).toEqual(searchBounds);
      expect(await stableBox(add)).toEqual(addBounds);

      const node = page.getByRole('button', { name: person.name, exact: true });
      await node.click();
      await expect(page).toHaveURL(/relationship\/person\?id=/);
      await expect(page.getByRole('status', { name: '正在加载人物详情', exact: true })).toBeVisible();
      detail.release();
      const profile = page.getByRole('button', { name: '编辑人物', exact: true });
      await expect(profile).toContainText(person.name);
      await expect(profile).toContainText(person.description);
      for (const label of ['标签', '生日', '电话', '邮箱', '本科学校', '社交链接', '备注']) {
        await expect(profile.locator('.profile-label').filter({ hasText: label })).toHaveCount(1);
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const row = page.getByRole('button', { name: '编辑关系：模拟人物乙', exact: true });
      await expect(row).toContainText('朋友 · 双向');
      await expect(row).toContainText('模拟关系说明');
      await expect(row).toContainText('同学');
      await waitForMotion(page);
      expect((await stableBox(row)).height).toBeGreaterThanOrEqual(44);
      const details = page.locator('.profile-body');
      const contrasts = await details.evaluate(el => {
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = channels => channels.map(value => {
          const n = value / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        return Array.from(el.querySelectorAll('.profile-ink, .profile-label, .profile-caption')).map(node => {
          const card = node.closest('.profile-card');
          if (!card) return 21;
          const background = luminance(rgb(getComputedStyle(card).backgroundColor));
          const foreground = luminance(rgb(getComputedStyle(node).color));
          return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
        });
      });
      expect(contrasts.length).toBeGreaterThan(10);
      expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/relationship-person/detail-${width}-${theme}.png` });
      await row.click();
      const editor = page.getByRole('dialog', { name: '关系', exact: true });
      await expect(editor.getByRole('button', { name: '保存关系', exact: true })).toBeVisible();
      await editor.getByRole('button', { name: '删除关系', exact: true }).click();
      const confirmation = page.getByRole('dialog', { name: '删除关系', exact: true });
      await expect(confirmation.getByText('确定删除关系？', { exact: true })).toBeVisible();
      await confirmation.getByRole('button', { name: '取消', exact: true }).click();
      await editor.getByRole('button', { name: '取消', exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(row).toBeVisible();
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await expect(page).toHaveURL(/relationship\/index$/);
    } finally {
      initial.release();
      detail.release();
    }
  });
}

test('relationship retry and refresh keep the graph canvas and empty state stable', async ({ page, apiMock }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'relationship-retry-fixture'));
  const failure = { json: { code: 1, message: '模拟图谱加载失败', data: null } };
  const responses = [
    { ...gate(), response: failure },
    { ...gate(), response: success({ nodes: [], edges: [] }) },
    { ...gate(), response: failure },
    { ...gate(), response: success({ nodes: [graph.nodes[0]], edges: [] }) },
  ];
  let reads = 0;
  apiMock({
    ...sessionFixtures,
    'GET /api/relationships/graph': async () => {
      const next = responses[reads++];
      await next.promise;
      return next.response;
    },
    'POST /api/relationships/persons': success(null),
  });
  try {
    await page.goto('/#/pages/relationship/index');
    const canvas = page.locator('.topology');
    const bounds = await stableBox(canvas);
    const initial = page.getByRole('status', { name: '正在加载关系图谱', exact: true });
    const updating = page.getByRole('status', { name: '正在更新内容', exact: true });
    const retry = page.getByRole('button', { name: '重试', exact: true });
    const empty = page.getByText('暂无人物', { exact: true });
    await expect(initial).toBeVisible();
    responses[0].release();
    await expect(page.getByText('模拟图谱加载失败', { exact: true })).toBeVisible();
    await retry.click();
    await expect(initial).toBeVisible();
    responses[1].release();
    await expect(empty).toBeVisible();
    const emptyBounds = await stableBox(empty);
    await page.getByRole('button', { name: '新增人物', exact: true }).click();
    const form = page.getByRole('dialog', { name: '人物', exact: true });
    await form.getByRole('textbox', { name: '姓名', exact: true }).fill(person.name);
    await form.getByRole('button', { name: '保存', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(updating).toBeVisible();
    await waitForMotion(page);
    const marker = await stableBox(updating);
    expect(marker.x + marker.width).toBeLessThan(bounds.x + bounds.width / 2);
    expect(marker.y + marker.height).toBeLessThan(bounds.y + bounds.height / 2);
    expect(await stableBox(empty)).toEqual(emptyBounds);
    await page.screenshot({ path: 'artifacts/relationship-loading/empty-refresh.png' });
    responses[2].release();
    await expect(retry).toBeVisible();
    expect(await stableBox(empty)).toEqual(emptyBounds);
    await retry.click();
    await expect(updating).toBeVisible();
    responses[3].release();
    await expect(page.getByRole('button', { name: person.name, exact: true })).toBeVisible();
    await expect(empty).toHaveCount(0);
    expect(await stableBox(canvas)).toEqual(bounds);
    expect(reads).toBe(responses.length);
  } finally {
    for (const response of responses) response.release();
  }
});
