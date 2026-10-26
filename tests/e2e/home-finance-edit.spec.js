const fs = require('node:fs');
const path = require('node:path');
const { selectCalendarDate } = require('./calendar');
const { test, expect } = require('@playwright/test');
const { calendarFixture } = require('./fixtures-finance-calendar');
const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7) + '-01';
async function setup(page, theme) {
  const state = { fail: false, writes: [], calls: [], rows: {
    expense: { id: '9223372036854775806', amt: 26, transactionAmt: 99, expTypeId: 'type', payTypeId: 'pay', expTime: day + ' 12:34:56', expDesc: '模拟地铁出行', counterparty: '模拟交通公司', transactionId: 'fixture-order', merchantOrderNo: 'fixture-merchant', remark: '原始备注' },
    income: { id: '9223372036854775807', amt: 8000, incTypeId: 'type', incDate: day, tax: 120, remark: '模拟工资收入' },
  } };
  await page.addInitScript(theme => {
    localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-home-edit' }));
    localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
  }, theme);
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), pathname = url.pathname.replace('/api', '');
    state.calls.push(pathname);
    let data = [];
    const routes = ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'];
    if (pathname === '/user/info') data = { id: 'fixture-user', nickname: '模拟用户' };
    if (pathname === '/home/cards') data = ['finance', 'income', 'expense'].map((kind, sortOrder) => ({ cardKey: 'section.' + kind, title: kind, group: 'section', enabled: true, sortOrder }));
    if (pathname === '/menu/all') data = routes.map((path, i) => ({ path, meta: { menuId: 'menu-' + i } }));
    if (pathname === '/quick-nav/candidates') data = routes.map(path => ({ path }));
    if (pathname === '/menu/visuals') data = { menus: [], cards: {} };
    if (pathname.endsWith('/getByDictType')) data = { dictDetailList: [{ id: url.searchParams.get('dictType') === 'pay_type' ? 'pay' : 'type', dictLabel: url.searchParams.get('dictType') === 'pay_type' ? '模拟支付' : '模拟分类' }] };
    if (/^\/(income|expense)(\/\d+)?$/.test(pathname) && req.method() !== 'GET') {
      const kind = pathname.split('/')[1]; state.writes.push({ kind, method: req.method(), body: req.postDataJSON(), pathname });
      if (state.fail) return route.fulfill({ json: { code: 1, message: '模拟保存失败' } });
      if (req.method() === 'DELETE') state.rows[kind] = null;
      else Object.assign(state.rows[kind], req.postDataJSON());
      data = true;
    }
    if (pathname.endsWith('/query')) {
      const row = state.rows[pathname.split('/')[1]], date = row?.expTime || row?.incDate;
      const start = url.searchParams.get('startTime'), end = url.searchParams.get('endTimeBefore');
      const items = row && (!start || date >= start) && (!end || date < end) ? [{ ...row }] : [];
      data = { items, total: items.length };
    }
    if (pathname.endsWith('/calendar')) {
      const kind = pathname.split('/')[3]; data = calendarFixture(url, kind);
      const income = state.rows.income?.incDate === day ? state.rows.income.amt : 0;
      const expense = state.rows.expense?.expTime.startsWith(day) ? state.rows.expense.amt : 0;
      const totals = { income, expense, balance: income - expense };
      data.amount = kind === 'finance' ? totals.balance : totals[kind];
      if (kind === 'finance') Object.assign(data, totals);
      data.buckets.forEach((bucket, i) => { bucket.amount = i ? 0 : data.amount; if (kind === 'finance') Object.assign(bucket, i ? { income: 0, expense: 0, balance: 0 } : totals); });
    }
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/home/index');
  return state;
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) for (const kind of ['expense', 'income']) {
  test(`首页${kind}复用弹窗并同步明细与合计 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const state = await setup(page, theme), label = kind === 'expense' ? '支出' : '收入';
    const card = page.locator('[aria-label="' + label + '首页卡片"]');
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await card.locator('.calendar-cell').first().click();
    const details = page.getByRole('dialog', { name: label + '明细', exact: true });
    await details.getByRole('button', { name: new RegExp('^编辑' + label + '：') }).click();
    const editor = page.getByRole('dialog', { name: '编辑' + label, exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('spinbutton', { name: kind === 'expense' ? '记账金额' : '金额', exact: true })).toHaveValue(String(state.rows[kind].amt));
    const folder = path.resolve('artifacts/home-finance-edit'); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, kind + '-' + width + '-' + theme + '.png') });
    await editor.getByRole('spinbutton', { name: kind === 'expense' ? '记账金额' : '金额', exact: true }).fill('100');
    await editor.getByRole('textbox', { name: '备注', exact: true }).fill('修改后的模拟备注');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(details).toContainText('修改后的模拟备注');
    await expect(details.locator('.details-total')).toHaveText('100.00');
    await expect(card.locator('.calendar-total')).toHaveText('100.00');
    const overview = page.locator('[aria-label="收支概览首页卡片"]');
    await expect(overview.locator('.calendar-metric-value').nth(kind === 'income' ? 0 : 1)).toHaveText('100.00');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].body.id || state.writes[0].pathname.split('/').pop()).toBe(state.rows[kind].id);
    if (kind === 'expense') { expect(state.writes[0].body.transactionId).toBe('fixture-order'); expect(state.writes[0].body.transactionAmt).toBe(99); }
    else expect(state.writes[0].body.tax).toBe(120);
    expect(await page.locator('body').evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false);
  });
}
test('保存失败保留表单和明细，取消不写入；移出日期范围后显示空态与零合计', async ({ page }) => {
  const state = await setup(page, 'light');
  const card = page.locator('[aria-label="收入首页卡片"]');
  await card.locator('.calendar-cell').first().click();
  const details = page.getByRole('dialog', { name: '收入明细', exact: true });
  await details.getByRole('button', { name: /^编辑收入：/ }).click();
  const editor = page.getByRole('dialog', { name: '编辑收入', exact: true });
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await details.getByRole('button', { name: /^编辑收入：/ }).click();
  state.fail = true;
  await editor.getByRole('textbox', { name: '备注', exact: true }).fill('失败后保留的备注');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toContainText('模拟保存失败');
  await expect(editor.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('失败后保留的备注');
  state.fail = false;
  await selectCalendarDate(page, editor.getByRole('button', { name: '日期', exact: true }), '2000-01-01');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(details).toContainText('暂无收入记录');
  await expect(details.locator('.details-total')).toHaveText('0.00');
});
test('概览内编辑当前收入与支出，删除失败保留表单且重试后同步空态', async ({ page }) => {
  const state = await setup(page, 'light');
  const card = page.locator('[aria-label="收支概览首页卡片"]');
  await card.locator('.calendar-cell').first().click();
  const details = page.getByRole('dialog', { name: '收支明细', exact: true });
  await details.getByRole('button', { name: '收入明细', exact: true }).click();
  await details.getByRole('button', { name: /^编辑收入：/ }).click();
  const income = page.getByRole('dialog', { name: '编辑收入', exact: true });
  await income.getByRole('spinbutton', { name: '金额', exact: true }).fill('9000');
  await income.getByRole('button', { name: '保存', exact: true }).click();
  await expect(income).toHaveCount(0);
  await expect(details.locator('.details-total')).toHaveText('9,000.00');
  await details.getByRole('button', { name: '支出明细', exact: true }).click();
  await details.getByRole('button', { name: /^编辑支出：/ }).click();
  const expense = page.getByRole('dialog', { name: '编辑支出', exact: true });
  state.fail = true;
  await expense.getByRole('button', { name: '删除支出', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(expense).toContainText('模拟保存失败');
  state.fail = false;
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(expense).toHaveCount(0);
  await expect(details).toContainText('暂无支出记录');
  await expect(details.locator('.details-total')).toHaveText('0.00');
});

for (const kind of ['expense', 'income']) test(`首页${kind}删除须确认，失败保留并重试后更新明细和全部合计`, async ({ page }) => {
  const state = await setup(page, 'light');
  const label = kind === 'expense' ? '支出' : '收入';
  const card = page.locator('[aria-label="' + label + '首页卡片"]');
  await card.locator('.calendar-cell').first().click();
  const details = page.getByRole('dialog', { name: label + '明细', exact: true });
  await details.getByRole('button', { name: new RegExp('^编辑' + label + '：') }).click();
  const editor = page.getByRole('dialog', { name: '编辑' + label, exact: true });
  await editor.getByRole('button', { name: '删除' + label, exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '删除' + label, exact: true });
  await expect(confirmation).toContainText('确认删除？');
  expect(state.writes).toHaveLength(0);
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await editor.getByRole('button', { name: '删除' + label, exact: true }).click();
  const folder = path.resolve('artifacts/home-finance-edit'); fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, kind + '-delete-confirm.png') });
  state.fail = true;
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await expect(confirmation).toContainText('模拟保存失败');
  await expect(editor).toBeVisible();
  await expect(details).toContainText(kind === 'expense' ? '模拟地铁出行' : '模拟工资收入');
  state.fail = false;
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(details).toContainText('暂无' + label + '记录');
  await expect(details.locator('.details-total')).toHaveText('0.00');
  await expect(card.locator('.calendar-total')).toHaveText('0.00');
  const overview = page.locator('[aria-label="收支概览首页卡片"]');
  await expect(overview.locator('.calendar-metric-value').nth(kind === 'income' ? 0 : 1)).toHaveText('0.00');
});
