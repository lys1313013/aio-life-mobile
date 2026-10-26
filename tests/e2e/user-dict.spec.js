const { test, expect } = require('@playwright/test');
const { pullDown } = require('./gestures');
test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
const labels = ['手机', '电脑', '平板', '手表', '耳机', '相机', '键盘', '鼠标'];
const icons = ['mdi:cellphone', 'mdi:laptop', 'mdi:tablet', 'mdi:watch', 'mdi:headphones', 'mdi:camera', 'mdi:keyboard', 'mdi:mouse'];
function fixture(count = 8) { return Array.from({ length: count }, (_, i) => ({ id: String(9223372036854775000n + BigInt(i)), userId: '0', dictType: 'device_type', dictLabel: labels[i] || '模拟设备 ' + (i + 1), dictSort: i, color: ['#397bee', '#8751e8', '#df9b23', '#2bb876'][i % 4], icon: icons[i % 8], status: i === 4 ? '1' : '0', isReadonly: i === 2 ? 'Y' : 'N' })); }
async function setup(page, count = 8, delay = 0) {
  const state = { rows: fixture(count), queries: [], writes: [], sorts: [], deleted: [], failSort: false, failDelete: false, failMore: false, failWrite: false, delay, sortDelay: 0, emptyMore: false };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'user-dict-fixture'));
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const ok = data => route.fulfill({ json: { code: 0, message: null, data } });
    const fail = message => route.fulfill({ json: { code: 1, message, data: null } });
    if (path === '/api/user/info') return ok({ id: '1', roles: ['admin'] });
    if (path === '/api/userDictType/dictTypeEnum') return ok([{ label: '设备类型', value: 'device_type' }, { label: '运动类型', value: 'exercise_type' }]);
    if (path === '/api/userDictData/admin/query') {
      const q = Object.fromEntries(url.searchParams); state.queries.push(q);
      const wait = state.delay; if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (q.page === '2' && state.failMore) return fail('模拟分页失败');
      const filtered = state.rows.filter(row => (!q.dictType || row.dictType === q.dictType) && (!q.dictLabel || row.dictLabel.includes(q.dictLabel)) && (!q.status || row.status === q.status));
      const start = (Number(q.page) - 1) * Number(q.pageSize);
      return ok({ items: q.page === '2' && state.emptyMore ? [] : filtered.slice(start, start + Number(q.pageSize)), total: filtered.length });
    }
    if (path === '/api/userDictData/admin/reSort') {
      const body = req.postDataJSON(); state.sorts.push(body);
      if (state.sortDelay) await new Promise(resolve => setTimeout(resolve, state.sortDelay));
      if (state.failSort) return fail('模拟排序失败');
      const next = state.rows.slice(), [row] = next.splice(next.findIndex(item => item.id === body.dragId), 1);
      next.splice(next.findIndex(item => item.id === body.targetId) + (body.position === 'after' ? 1 : 0), 0, row);
      state.rows = next.map((row, i) => ({ ...row, dictSort: i * 10 }));
      return ok(state.rows.map(({ id, dictSort }) => ({ id, dictSort })));
    }
    if (path === '/api/userDictData/admin' && method === 'POST') {
      const body = req.postDataJSON(); state.writes.push(body);
      state.rows.push({ ...body, userId: '0', id: '9223372036854775999' }); return ok(true);
    }
    if (/\/api\/userDictData\/admin\/\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      if (method === 'DELETE') {
        state.deleted.push(id); if (state.failDelete) return fail('模拟删除失败');
        state.rows = state.rows.filter(row => row.id !== id); return ok(true);
      }
      const body = req.postDataJSON(); state.writes.push({ id, ...body });
      if (state.failWrite) return fail('模拟编辑失败');
      state.rows = state.rows.map(row => row.id === id ? { ...row, ...body } : row); return ok(true);
    }
    return ok([]);
  });
  await page.goto('/#/pages/admin/index?kind=user-dict');
  return state;
}
async function ready(page, count = 8) { await expect(page.locator('.user-dict-row')).toHaveCount(count); }
async function swipe(page, index, dx, dy = 0) {
  const row = page.locator('.user-dict-front').nth(index); await row.scrollIntoViewIfNeeded();
  const b = await row.boundingBox(), x = b.x + b.width * (dx < 0 ? .8 : .2), y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 6, y: y + dy * i / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}
async function drag(page, from, to, cancel = false) {
  const a = await page.locator('.user-dict-front').nth(from).boundingBox(), b = await page.locator('.user-dict-front').nth(to).boundingBox();
  const x = a.x + 90, y = a.y + a.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await expect(page.locator('.user-dict-sort-active')).toHaveCount(1);
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (b.y - a.y) * i / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}
async function bottom(page) {
  await page.waitForTimeout(250);
  await page.locator('.mobile-page-scroll .uni-scroll-view').first().evaluate(el => { el.scrollTop = 0; });
  await page.locator('.mobile-page-scroll').hover();
  await page.mouse.wheel(0, 100000);
}

test('点击编辑、失败保留、新增与更新局部状态', async ({ page }) => {
  const state = await setup(page); await ready(page);
  expect(state.queries[0].dictType).toBe('device_type');
  await expect(page.locator('.user-dict-front').first()).toHaveAttribute('aria-label', /编辑手机/);
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  await page.locator('.user-dict-front').first().click();
  const modal = page.getByRole('dialog', { name: '用户字典管理', exact: true });
  await expect(modal.getByRole('textbox', { name: '字典名称', exact: true })).toHaveValue('手机');
  await modal.getByRole('textbox', { name: '字典名称', exact: true }).fill('模拟修改手机');
  state.failWrite = true;
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('模拟编辑失败');
  await expect(modal.getByRole('textbox', { name: '字典名称', exact: true })).toHaveValue('模拟修改手机');
  state.failWrite = false;
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.user-dict-title').first()).toHaveText('模拟修改手机');
  expect(state.queries).toHaveLength(1); expect(state.writes[1].id).toBe(fixture()[0].id);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(modal.locator('uni-picker[aria-label="字典类型"]')).toContainText('设备类型');
  await modal.getByRole('textbox', { name: '字典名称', exact: true }).fill('模拟新增设备');
  await modal.getByRole('button', { name: '保存', exact: true }).click();
  await ready(page, 9);
});

test('长按拖动保存相对落点，失败回退、取消不提交、短滑不误触', async ({ page }) => {
  const state = await setup(page); await ready(page);
  await swipe(page, 0, -4, -45);
  expect(state.sorts).toHaveLength(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await drag(page, 0, 2, true);
  expect(state.sorts).toHaveLength(0);
  await drag(page, 0, 2);
  await expect.poll(() => state.sorts.length).toBe(1);
  expect(state.sorts[0]).toEqual({ dictType: 'device_type', dragId: fixture()[0].id, targetId: fixture()[2].id, position: 'after' });
  await expect(page.locator('.user-dict-title').nth(2)).toHaveText('手机');
  await expect(page.locator('.user-dict-rank').nth(2)).toHaveText('排序 20');
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(state.queries).toHaveLength(1);
  state.failSort = true;
  await drag(page, 2, 0);
  await expect.poll(() => state.sorts.length).toBe(2);
  await expect(page.locator('.user-dict-title').nth(2)).toHaveText('手机');
  await expect(page.locator('.user-dict-sort-active')).toHaveCount(0);
});

test('排序保存局部 loading，锁定重复操作，键盘排序可用', async ({ page }) => {
  const state = await setup(page); await ready(page); state.sortDelay = 700;
  await page.locator('.user-dict-front').first().press('ArrowDown');
  await expect(page.locator('.user-dict-state [role="status"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '新增', exact: true })).toBeDisabled();
  await page.locator('.user-dict-front').first().press('ArrowDown');
  expect(state.sorts).toHaveLength(1);
  await expect(page.locator('.user-dict-state [role="status"]')).toHaveCount(0);
  await expect(page.locator('.user-dict-title').nth(1)).toHaveText('手机');
});

test('左滑删除、单行展开、纵滑不展开、失败原位重试', async ({ page }) => {
  const state = await setup(page); await ready(page);
  await swipe(page, 0, -5, -50); await expect(page.locator('.user-dict-delete')).toHaveCount(0);
  await swipe(page, 0, -110); await expect(page.locator('.user-dict-delete')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await swipe(page, 1, -110);
  await expect(page.locator('.user-dict-row').first().locator('.user-dict-delete')).toHaveCount(0);
  await swipe(page, 1, 110); await expect(page.locator('.user-dict-delete')).toHaveCount(0);
  await swipe(page, 0, -110);
  await page.getByRole('button', { name: '删除手机', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '删除手机', exact: true });
  state.failDelete = true;
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await expect(confirm.getByRole('alert')).toHaveText('模拟删除失败'); await ready(page);
  state.failDelete = false;
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await ready(page, 7); await expect(page.locator('.user-dict-count')).toHaveText('7 项');
  expect(state.deleted).toEqual([fixture()[0].id, fixture()[0].id]); expect(state.queries).toHaveLength(1);
});

test('触底分页失败恢复、去重、删除后边界不漏项与末页停止', async ({ page }) => {
  const state = await setup(page, 25); await ready(page, 20);
  await swipe(page, 0, -110); await page.getByRole('button', { name: '删除手机', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click(); await ready(page, 19);
  await bottom(page); await ready(page, 20);
  state.failMore = true;
  await bottom(page); await expect(page.getByText('模拟分页失败', { exact: true })).toBeVisible(); await ready(page, 20);
  state.failMore = false;
  await page.getByRole('button', { name: '重试加载', exact: true }).click(); await ready(page, 24);
  expect(new Set(await page.locator('.user-dict-sort-item').evaluateAll(nodes => nodes.map(node => node.dataset.dictId))).size).toBe(24);
  const count = state.queries.length; await bottom(page); expect(state.queries).toHaveLength(count);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) test(`布局和手势状态 ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 960 }); await page.emulateMedia({ colorScheme: theme });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const state = await setup(page); await ready(page);
  await expect(page.locator('.user-dict-row').nth(2)).toHaveAttribute('class', /user-dict-row/);
  await expect(page.locator('.user-dict-row').nth(4)).toContainText('禁用');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('list.png') });
  await swipe(page, 4, -110); await page.screenshot({ path: info.outputPath('swipe.png') });
  await page.getByRole('button', { name: '删除耳机', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除耳机' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('confirm.png') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await swipe(page, 4, 110); await page.waitForTimeout(500);
  await page.locator('.user-dict-front').nth(2).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: info.outputPath('edit.png') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const before = await page.locator('.user-dict-list').boundingBox(); state.delay = 600;
  await pullDown(page, '.mobile-page-scroll');
  await expect.poll(() => state.queries.length).toBe(2);
  const during = await page.locator('.user-dict-list').boundingBox();
  expect(during.height).toBe(before.height); await ready(page);
  expect(errors).toEqual([]);
});

test('搜索旧响应隔离、空态刷新高度保持和重置恢复', async ({ page }) => {
  const state = await setup(page); await ready(page);
  const search = page.getByRole('textbox', { name: '字典名称', exact: true });
  state.delay = 900; await search.fill('手机');
  await expect.poll(() => state.queries.at(-1).dictLabel).toBe('手机');
  state.delay = 0; await search.fill('电脑');
  await expect(page.locator('.user-dict-title')).toHaveText(['电脑']);
  await page.waitForTimeout(1000); await expect(page.locator('.user-dict-title')).toHaveText(['电脑']);
  await search.fill('不存在'); await expect(page.getByText('没有匹配的字典', { exact: true })).toBeVisible();
  const before = await page.locator('.user-dict-region').boundingBox(); state.delay = 600;
  await pullDown(page, '.mobile-page-scroll');
  await expect(page.locator('.user-dict-region [role="status"]')).toHaveCount(1);
  expect((await page.locator('.user-dict-region').boundingBox()).height).toBe(before.height);
  await expect(page.locator('.user-dict-region [role="status"]')).toHaveCount(0);
  state.delay = 0; await page.getByRole('button', { name: '重置筛选', exact: true }).click(); await ready(page);
});

test('鼠标长按跨行拖动不误触编辑', async ({ page }) => {
  const state = await setup(page); await ready(page);
  const a = await page.locator('.user-dict-front').nth(0).boundingBox(), b = await page.locator('.user-dict-front').nth(2).boundingBox();
  const x = a.x + 100, y = a.y + a.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await expect(page.locator('.user-dict-sort-active')).toHaveCount(1);
  await page.mouse.move(x, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => state.sorts.length).toBe(1);
  await expect(page.locator('.user-dict-title').nth(2)).toHaveText('手机');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
