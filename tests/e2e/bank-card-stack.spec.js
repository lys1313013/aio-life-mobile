const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const path = require('node:path');
const out = path.resolve('artifacts/bank-card-stack');

for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`银行卡堆叠展开、操作与视图记忆 ${width} ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 不预置平铺偏好，验证首次进入默认卡包。
    const state = await setup(page, baseURL, null);
    const colors = ['#123b74', '#685174', '#163e32', '#1c2029', '#c7e3d9', '#716348', '#bc342f'];
    state.cards = colors.map((color, i) => ({
      ...state.cards[0], id: String(88 + i), sortOrder: i,
      bankName: `示例银行 ${i + 1}`, cardName: `示例卡 ${i + 1}`, cardNoFirst4: '6222',
      coverColor: color, coverFileIds: i % 2 ? [] : [`stack-cover-${i}`],
      // 公共模板与私人图片混排，均复用相同堆叠交互。
      ...(i === 0 ? { coverTemplateId: '901', coverTemplateFileId: 'stack-cover-0', coverFileIds: [] } : {}),
    }));
    await page.route('**/api/file/preview/stack-cover-*', route => {
      const i = Number(route.request().url().split('-').pop());
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" fill="${colors[i]}"/><path d="M350 700 Q400 100 950 120 M410 700 Q480 180 990 160 M470 700 Q570 220 1000 200" fill="none" stroke="#ffffff33" stroke-width="5"/><circle cx="74" cy="78" r="30" fill="#dfc584"/><text x="125" y="96" font-family="sans-serif" font-size="46" fill="${i === 4 ? '#163e32' : '#fff'}">DEMO BANK ${i + 1}</text><text x="65" y="495" fill="#dfc584" font-family="sans-serif" font-size="24">SAMPLE CARD · ${i + 1}</text></svg>` });
    });
    await page.goto('/#/pages/finance/cards');
    await expect(page.locator('.card-stack .card')).toHaveCount(7);
    await expect(page.locator('.cover')).toHaveCount(4);
    await expect(page.getByRole('button', { name: '银行卡更多操作', exact: true })).toHaveCount(0);
    const faces = page.locator('.card-grid .card-face');
    const positions = await faces.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width }; }));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].top - positions[i - 1].top).toBeGreaterThanOrEqual(44);
      expect(positions[i].top).toBeLessThan(positions[i - 1].bottom);
      expect(positions[i].width).toBeLessThanOrEqual(420);
    }
    await page.screenshot({ path: `${out}/${width}-${theme}-stack.png`, fullPage: true });
    // 点顶部露出区域，确认命中对应卡片，而非被后面的卡面截获。
    await faces.nth(0).click({ position: { x: 40, y: 30 } });
    await expect(faces.nth(0)).toHaveAttribute('aria-expanded', 'true');
    const first = page.locator('.card').first();
    await expect(first.locator('.card-image-footer')).toBeVisible();
    const firstBox = await first.boundingBox(), secondBox = await page.locator('.card').nth(1).boundingBox();
    expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height);
    await first.getByRole('button', { name: '银行卡更多操作' }).click();
    await expect(page.getByRole('menuitem', { name: '编辑银行卡', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: '查看卡号', exact: true }).click();
    await expect(first.locator('.number')).toHaveText('6222 0000 1234');
    await first.getByRole('button', { name: '银行卡更多操作' }).click();
    await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '银行卡', exact: true })).toBeVisible();
    await page.getByRole('dialog', { name: '银行卡', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
    // 键盘选择另一张默认卡，前一张收起，菜单仍在视口内。
    await faces.nth(1).press('Enter');
    await expect(faces.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(faces.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '银行卡更多操作' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    const menu = await page.getByRole('menu').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await page.getByRole('menuitem', { name: '删除银行卡', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '删除银行卡', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.screenshot({ path: `${out}/${width}-${theme}-expanded.png`, fullPage: true });
    await faces.nth(1).press('Space');
    await expect(faces.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: '切换为平铺视图' }).click();
    await expect(page.getByRole('button', { name: /^编辑银行卡：/ })).toHaveCount(7);
    await page.reload();
    await expect(page.getByRole('button', { name: '切换为堆叠视图' })).toBeVisible();
    await page.getByRole('button', { name: '切换为堆叠视图' }).click();
    await page.reload();
    await expect(page.locator('.card-stack .card')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(state.calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}
