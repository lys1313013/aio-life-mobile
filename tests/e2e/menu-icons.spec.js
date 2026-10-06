const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const catalog = require('../../src/services/icons/business-icons.json');

const samples = [
  ['银行卡', 'lucide:credit-card'],
  ['功能分组', 'lucide:folder'],
  ['微信支付', 'ant-design:wechat-outlined'],
  ['财务分类', 'mdi:credit-card-outline'],
  ['空间', 'carbon:cube'],
  ['其他', 'basil:other-1-outline'],
  ['编程', 'devicon:leetcode'],
  ['工作', 'gg:work-alt'],
  ['训练', 'hugeicons:workout-squats'],
  ['模型', 'ic:baseline-view-in-ar'],
  ['人民币', 'ri:money-cny-box-line'],
  ['技术社区', 'simple-icons:csdn'],
  ['游戏', 'tabler:pacman'],
  ['平板支撑', 'svg:plank'],
];

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`菜单图标不回退且离线显示 ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const externalIcons = [];
    page.on('request', request => { if (/iconify/.test(request.url())) externalIcons.push(request.url()); });
    const entries = samples.map(([title, icon], i) => ({ menuId: String(i + 1), title, icon, color: '#8584bb', path: '/finance-management/bank-cards' }));
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const path = new URL(route.request().url()).pathname;
      let data = dashboardFixture(path);
      if (path === '/api/auth/login') data = { accessToken: 'icon-fixture' };
      if (path === '/api/user/info') data = { id: 'icon-fixture', nickname: '图标测试' };
      if (path === '/api/quick-nav/my') data = [];
      if (path === '/api/quick-nav/candidates') data = entries;
      if (path === '/api/menu/preferences') data = { menus: [{ id: 'icons', title: '图标检查', children: entries.map(item => ({ id: item.menuId, title: item.title, children: [] })) }], hiddenMenuIds: [] };
      await route.fulfill({ json: { code: 0, data } });
    });
    await page.goto('/');
    await page.locator('[aria-label="账号"] input').fill('fixture');
    await page.locator('[aria-label="密码"] input').fill('fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
    for (const [label, name] of samples) {
      const image = page.getByRole('button', { name: label, exact: true }).locator('.category-icon-image img');
      await expect(image).toHaveCount(1);
      await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const svg = Buffer.from((await image.getAttribute('src')).split(',')[1], 'base64').toString();
      expect(svg).toContain(catalog.icons[name].body.replaceAll('currentColor', '#8584bb'));
    }
    expect(externalIcons).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('menu-icons.png'), fullPage: true });
  });
}
