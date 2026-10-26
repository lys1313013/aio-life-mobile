const { dismissModal } = require('./modal');
const { test, expect } = require('@playwright/test');
const { calendarFixture } = require('./fixtures-finance-calendar');

for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`首页其他请求未完成时收支卡片可独立交互 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [], calendars = [];
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const previous = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => {
      localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'fixture-startup' }));
      localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
    }, theme);
    let release, waiting = false, completed = false;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), pathname = url.pathname.replace('/api', '');
      const routes = ['/finance-management/dashboard', '/finance-management/income', '/finance-management/expense'];
      let data = [];
      if (pathname === '/user/info') data = { id: 'startup-user', nickname: '模拟用户' };
      if (pathname === '/home/cards') data = ['income', 'expense'].map((kind, sortOrder) => ({ cardKey: 'section.' + kind, title: kind, group: 'section', enabled: true, sortOrder }));
      if (pathname === '/menu/all') data = routes.map((path, i) => ({ path, meta: { menuId: 'menu-' + i } }));
      if (pathname === '/quick-nav/candidates') data = routes.map(path => ({ path }));
      if (pathname === '/menu/visuals') data = { menus: [], cards: {} };
      if (pathname === '/dashboard/tasks') { waiting = true; await pending; completed = true; }
      if (pathname.endsWith('/calendar')) {
        const kind = pathname.split('/')[3];
        calendars.push({ kind, date: url.searchParams.get('date'), mode: url.searchParams.get('granularity') });
        data = calendarFixture(url, kind);
      }
      if (pathname.endsWith('/getByDictType')) data = { dictDetailList: [] };
      if (pathname.endsWith('/query')) data = { items: [], total: 0 };
      await route.fulfill({ json: { code: 0, data } });
    });
    try {
      await page.goto('/#/pages/home/index');
      await expect.poll(() => waiting).toBe(true);
      for (const [kind, label] of [['income', '收入'], ['expense', '支出']]) {
        const card = page.locator(`[aria-label="${label}首页卡片"]`);
        await expect(card).toHaveAttribute('aria-busy', 'false');
        // 首次点击月份就应打开选择器，取消后范围不变。
        const originalDate = await card.locator('.calendar-date').innerText();
        await card.locator('.calendar-date-picker').click();
        const calendar = page.getByRole('dialog', { name: /日历$/ });
        await expect(calendar).toBeVisible();
        await dismissModal(page);
        await expect(card.locator('.calendar-date')).toHaveText(originalDate);
        await card.getByRole('button', { name: '上一时间段', exact: true }).click();
        await expect.poll(() => calendars.some(row => row.kind === kind && row.date === previous)).toBe(true);
        await expect(card).toHaveAttribute('aria-busy', 'false');
        await card.getByRole('button', { name: label + '：月', exact: true }).click();
        await expect(card.getByRole('button', { name: label + '：月', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await card.locator('.calendar-cell').first().click();
        const details = page.getByRole('dialog', { name: label + '明细', exact: true });
        await expect(details).toContainText('暂无' + label + '记录');
        await page.screenshot({ path: info.outputPath(kind + '-details.png') });
        await details.getByRole('button', { name: '关闭', exact: true }).click();
      }
      expect(completed).toBe(false);
      await page.getByRole('button', { name: '查看支出', exact: true }).click();
      await expect(page).toHaveURL(/pages\/finance\/expense/);
      expect(errors).toEqual([]);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
