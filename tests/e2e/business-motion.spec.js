const { test, expect } = require('./support/test');
const { capturePageMotion, captureModalMotion } = require('./support/motion');

const ok = data => ({ json: { code: 0, message: null, data } });
const entries = [
  { menuId: 'finance', path: '/finance-management/dashboard', title: '财务', icon: 'lucide:wallet' },
  { menuId: 'income', path: '/finance-management/income', title: '收入', icon: 'mdi:cash-plus' },
  { menuId: 'expense', path: '/finance-management/expense', title: '支出', icon: 'mdi:cash-minus' },
  { menuId: 'goals', path: '/task/goal', title: '目标', icon: 'mdi:target' },
];
async function setup(page, apiMock) {
  apiMock({
    'GET /api/user/info': ok({ id: 'motion-fixture', nickname: '业务动效模拟用户' }),
    'GET /api/message/unread-count': ok({ count: 0 }),
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/menu/preferences': ok({ menus: entries.map(item => ({ id: item.menuId, title: item.title, children: [] })), hiddenMenuIds: [] }),
    'GET /api/quick-nav/candidates': ok(entries),
    'GET /api/quick-nav/my': ok([]),
    'GET /api/income/statisticsByMonth': ok([{ year: 2026, month: 11, detail: [{ typeId: 'salary', typeName: '工资', grossAmount: 8000 }] }]),
    'GET /api/expense/statisticsByMonth': ok([{ year: 2026, month: 11, detail: [{ typeId: 'food', typeName: '餐饮', bookkeepingAmount: 600 }] }]),
    'GET /api/income/query': ok({ items: [{ id: '9223372036854775807', grossAmount: 8000, incomeDate: '2026-11-12', incomeTypeId: 'salary', remark: '模拟工资收入' }], total: 1 }),
    'GET /api/userDictType/getByDictType': ok({ dictDetailList: [{ id: 'salary', dictLabel: '工资' }] }),
    'GET /api/goals': ok([{ id: 'goal-fixture', title: '模拟年度阅读目标', type: 1, status: 'in_progress', currentValue: 35, targetValue: 100, progressMode: 'manual', isPinned: 0, startDate: '2026-01-01', endDate: '2026-12-31' }]),
  });
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'business-motion-fixture'));
  await page.goto('/#/pages/life/index');
  await expect(page.getByRole('button', { name: '财务', exact: true })).toBeVisible();
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`目标编辑选项与删除按钮底色透明 ${width} ${theme}`, async ({ page, apiMock }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, apiMock);
    await page.getByRole('button', { name: '目标', exact: true }).click();
    await page.getByRole('button', { name: '编辑目标：模拟年度阅读目标', exact: true }).click();

    const editor = page.getByRole('dialog', { name: '编辑目标', exact: true });
    const options = editor.locator('.goal-options');
    const details = editor.getByRole('button', { name: '补充资料', exact: true });
    const pinned = editor.getByRole('switch', { name: '添加到首页', exact: true });
    const remove = editor.getByRole('button', { name: '删除目标', exact: true });
    await pinned.click();
    await expect(pinned).toHaveAttribute('aria-checked', 'true');
    await expect(options).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(details).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const removeArea = await remove.boundingBox();
    expect(removeArea.width).toBeGreaterThanOrEqual(44);
    expect(removeArea.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('goal-editor.png') });

    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expect(editor.getByText('行动计划', { exact: true })).toBeVisible();
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'false');
    await remove.click();
    const confirmation = page.getByRole('dialog', { name: '删除目标', exact: true });
    await expect(confirmation.getByText('确定删除目标？', { exact: true })).toBeVisible();
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await editor.getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor).toHaveCount(0);
  });

  test(`业务页面多层进退与目标弹窗 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page, apiMock);
    await page.getByRole('button', { name: '财务', exact: true }).click();
    await capturePageMotion(page, 'forward', `artifacts/business-motion/business-finance-push-${width}-${theme}.png`);
    await expect(page.locator('.summary-number')).toHaveText(['8,000.00', '600.00', '7,400.00', '92.5']);
    await page.locator('.finance-actions').getByRole('button', { name: '收入', exact: true }).click();
    await capturePageMotion(page, 'forward', `artifacts/business-motion/business-income-push-${width}-${theme}.png`);
    await expect(page.getByText('模拟工资收入', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await capturePageMotion(page, 'back', `artifacts/business-motion/business-income-pop-${width}-${theme}.png`);
    await page.goBack();
    await capturePageMotion(page, 'back', `artifacts/business-motion/business-finance-pop-${width}-${theme}.png`);
    await expect(page.getByRole('button', { name: '财务', exact: true })).toBeVisible();
    await page.goForward();
    await capturePageMotion(page, 'forward', `artifacts/business-motion/business-browser-forward-${width}-${theme}.png`);
    await page.goBack();
    await capturePageMotion(page, 'back', `artifacts/business-motion/business-browser-back-${width}-${theme}.png`);
    await page.getByRole('button', { name: '目标', exact: true }).click();
    await capturePageMotion(page, 'forward', `artifacts/business-motion/business-goals-push-${width}-${theme}.png`);
    await expect(page.getByText('模拟年度阅读目标', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '新增目标', exact: true }).click();
    await captureModalMotion(page, false, `artifacts/business-motion/business-goal-modal-open-${width}-${theme}.png`);
    await page.getByRole('dialog', { name: '编辑目标', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
    await captureModalMotion(page, true, `artifacts/business-motion/business-goal-modal-close-${width}-${theme}.png`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await capturePageMotion(page, 'back', `artifacts/business-motion/business-goals-pop-${width}-${theme}.png`);
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await expect(page.getByRole('button', { name: '账号与安全', exact: true })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/aio-page-motion/);
  });
}
