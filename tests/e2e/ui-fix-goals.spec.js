const { test, expect } = require('./support/test');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { dashboardFixture } = require('./fixtures.js');

const output = path.resolve(__dirname, '../../artifacts/ui-fixes-2026-10-25/goals');
const id = '9223372036854775807';

async function setup(page) {
  const currentYear = new Date().getFullYear();
  const goals = [
    { id, title: '模拟跨年长期目标', type: 8, status: 'in_progress', startDate: '2026-10-25 09:00:00', endDate: '2031-10-25 18:00:00', currentValue: 2, targetValue: 10, description: '模拟目标描述', content: '模拟行动计划', tags: '阅读,学习', parentId: '9223372036854775806', isPinned: 0 },
    { id: '9223372036854775805', title: '模拟同年短期目标', type: 3, status: 'in_progress', startDate: currentYear + '-10-01 00:00:00', endDate: currentYear + '-10-31 23:59:00', currentValue: 0, targetValue: 1, isPinned: 0 },
  ];
  const writes = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data = dashboardFixture(pathname);
    if (pathname === '/api/auth/login') data = { accessToken: 'ui-fix-goals-fixture' };
    if (pathname === '/api/user/info') data = { id: '6', nickname: '模拟用户', accountUsername: 'fixture' };
    if (pathname === '/api/goals') {
      if (request.method() === 'GET') data = goals;
      else {
        const body = request.postDataJSON();
        writes.push(body);
        Object.assign(goals.find(goal => goal.id === body.id), body);
        data = { ...body };
      }
    }
    await route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.goto('/#/pages/tasks/goals');
  await expect(page.getByText('模拟跨年长期目标', { exact: true })).toBeVisible();
  return writes;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test('目标日期、折叠资料与固定操作栏 ' + width + ' ' + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const writes = await setup(page);
    const longCard = page.getByRole('button', { name: '编辑目标：模拟跨年长期目标', exact: true });
    await expect(longCard).toContainText('2026-10-25 ~ 2031-10-25');
    await expect(page.getByRole('button', { name: '编辑目标：模拟同年短期目标', exact: true })).toContainText('10-01 ~ 10-31');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, width + '-' + theme + '-list.png') });

    await longCard.click();
    const dialog = page.getByRole('dialog', { name: '编辑目标', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '补充资料', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('textbox', { name: '描述', exact: true })).toHaveCount(0);
    await expect(dialog.getByText('描述、行动计划、标签', { exact: true })).toBeVisible();
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    await expect(save).toBeInViewport();
    await page.screenshot({ path: path.join(output, width + '-' + theme + '-collapsed.png') });

    // 保存时折叠字段仍保留，避免视觉精简导致业务数据丢失。
    await dialog.getByRole('textbox', { name: '标题', exact: true }).fill('模拟跨年长期目标已更新');
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(writes.at(-1)).toMatchObject({ id, parentId: '9223372036854775806', description: '模拟目标描述', content: '模拟行动计划' });
    expect(JSON.parse(writes.at(-1).tags)).toEqual(['阅读', '学习']);

    await page.getByRole('button', { name: '编辑目标：模拟跨年长期目标已更新', exact: true }).click();
    await dialog.getByRole('button', { name: '补充资料', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: '描述', exact: true })).toHaveValue('模拟目标描述');
    await expect(dialog.getByRole('textbox', { name: '标签', exact: true })).toHaveValue('阅读，学习');
    await expect(save).toBeInViewport();
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
    await page.screenshot({ path: path.join(output, width + '-' + theme + '-expanded.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
