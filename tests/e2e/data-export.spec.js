const { test, expect } = require('./support/test');
const { dashboardFixture } = require('./fixtures.js');

async function setup(page, remaining = 5) {
  const state = { remaining, writes: [], jobs: [], fail: false };
  await page.route(new URL('/api/**', test.info().project.use.baseURL).href, async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'export-fixture' };
    if (path === '/api/user/info') data = { id: '9223372036854775807', accountUsername: 'fixture', nickname: '测试用户' };
    if (path === '/api/me/data-exports/catalog') data = { version: 'v1', verificationMethod: 'PASSWORD', datasets: [
      { key: 'tasks', title: '待办', state: 'AVAILABLE' }, { key: 'cards', title: '银行卡', state: 'LOCKED', lockedMenu: '/finance/bank-cards' },
      { key: 'graph', title: '人物关系', state: 'UNAVAILABLE' }], exclusions: ['不含登录凭据与附件原件'] };
    if (path === '/api/me/data-exports/quota') data = { remaining: state.remaining, limit: 5, month: '2026-10' };
    if (path === '/api/me/data-exports/authorizations') {
      state.writes.push(req.postDataJSON()); data = { grant: 'single-use-grant' };
      if (state.fail) return route.fulfill({ json: { code: 4001, message: '密码错误' } });
    }
    if (path === '/api/me/data-exports') {
      if (method === 'POST') {
        state.writes.push({ headers: req.headers(), body: req.postDataJSON() });
        state.remaining--;
        state.jobs = [{ id: '9223372036854775806', status: 'QUEUED', createTime: '2026-10-25 12:00:00', artifactStatus: 'NONE', rowCount: 0 }];
        data = state.jobs[0];
      } else data = { items: state.jobs, total: state.jobs.length };
    }
    if (path.endsWith('/cancel')) { state.jobs[0].status = 'CANCELLED'; state.remaining++; data = null; }
    if (data === undefined) return route.fulfill({ status: 404, body: path });
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await page.getByRole('button', { name: '数据导出', exact: true }).click();
  await expect(page.getByText(`本月剩余 ${remaining} / 5 次`)).toBeVisible();
  return state;
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`导出布局 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await setup(page);
    await page.getByText('导出范围（2 项）', { exact: false }).click();
    await expect(page.getByText('☐ 人物关系（不可用）', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/data-export-${width}-${theme}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
test('核验失败不建单，正确核验后携带凭证和幂等键，排队取消退额', async ({ page }) => {
  const state = await setup(page); state.fail = true;
  await page.getByRole('button', { name: '生成 Excel', exact: true }).click();
  await page.getByRole('textbox', { name: '登录密码', exact: true }).fill('wrong');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByText('密码错误', { exact: true })).toBeVisible();
  expect(state.jobs).toHaveLength(0); state.fail = false;
  await page.getByRole('textbox', { name: '登录密码', exact: true }).fill('correct');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByText('排队中', { exact: true })).toBeVisible();
  const created = state.writes.find(row => row.headers);
  expect(created.headers['x-export-grant']).toBe('single-use-grant');
  expect(created.headers['idempotency-key']).toMatch(/^export-/);
  expect(created.body).toEqual({ datasetKeys: ['tasks', 'cards'], catalogVersion: 'v1' });
  await expect(page.getByRole('button', { name: '生成 Excel', exact: true })).toBeDisabled();
  await page.getByText('取消导出', { exact: true }).click();
  await page.getByText('确定', { exact: true }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();
  await expect(page.getByText('本月剩余 5 / 5 次')).toBeVisible();
});
test('月额度用完禁用生成', async ({ page }) => {
  await setup(page, 0);
  await expect(page.getByRole('button', { name: '生成 Excel', exact: true })).toBeDisabled();
});
