const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" fill="#31567a"/><text x="50" y="95" fill="white" font-size="40">DEMO BANK</text></svg>';

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`卡面慢加载不显示默认卡且布局稳定 ${width} ${theme}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page, baseURL, 'stack');
    const original = state.cards[0];
    state.cards = [original, ...Array.from({ length: 4 }, (_, i) => ({ ...original, id: String(89 + i), sortOrder: 2 + i, coverTemplateFileId: 'slow-cover' }))];
    let releaseCards;
    const cardsGate = new Promise(resolve => { releaseCards = resolve; });
    await page.route('**/api/bank-cards', async route => {
      await cardsGate;
      await route.fulfill({ json: { code: 0, data: state.cards } });
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/file/preview/slow-cover', async route => {
      await gate;
      await route.fulfill({ contentType: 'image/svg+xml', body: image });
    });
    await page.goto('/#/pages/finance/cards');
    // 同时检查初始占位与多张真实卡面待加载，避免只验证一张骨架。
    const initial = page.locator('.card-loading');
    await expect(initial).toHaveCount(4);
    const colors = await initial.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
    for (let i = 1; i < colors.length; i++) expect(colors[i]).not.toBe(colors[i - 1]);
    await expect(initial.first()).toHaveCSS('border-top-style', 'solid');
    await page.screenshot({ path: `artifacts/bank-card-loading/${width}-${theme}-initial-stack.png`, fullPage: true });
    releaseCards();
    await expect(page.locator('.card')).toHaveCount(5);
    const pending = page.locator('.card').nth(1);
    await expect(pending.getByRole('status', { name: '正在加载银行卡卡面' })).toBeVisible();
    await expect(pending.locator('.face-heading')).toHaveCount(0);
    const placeholder = pending.locator('.card-loading');
    await expect(placeholder).toHaveCSS('opacity', '1');
    await expect(placeholder).toHaveCSS('background-color', theme === 'dark' ? 'rgb(52, 65, 85)' : 'rgb(203, 214, 228)');
    await expect(placeholder).toHaveCSS('animation-name', 'none');
    await page.screenshot({ path: `artifacts/bank-card-loading/${width}-${theme}-stack-pending.png`, fullPage: true });
    await expect(page.locator('.card').first().locator('.face-heading')).toBeVisible();
    await page.getByRole('button', { name: '切换为平铺视图' }).click();
    const before = await pending.boundingBox();
    await page.screenshot({ path: `artifacts/bank-card-loading/${width}-${theme}-pending.png`, fullPage: true });
    release();
    await expect(pending.locator('.card-face')).toHaveAttribute('aria-busy', 'false');
    await expect(pending.locator('.cover')).toHaveCSS('visibility', 'visible');
    await expect(pending.getByRole('status')).toHaveCount(0);
    const after = await pending.boundingBox();
    expect(Math.abs(after.height - before.height)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    await page.screenshot({ path: `artifacts/bank-card-loading/${width}-${theme}-ready.png`, fullPage: true });
  });
}

for (const failure of ['download', 'decode']) {
  test(`卡面${failure}失败可局部重试`, async ({ page, baseURL }) => {
    const state = await setup(page, baseURL, 'stack');
    state.cards.push({ ...state.cards[0], id: '89', sortOrder: 2 });
    state.cards[0].coverFileIds = ['failed-cover'];
    let attempts = 0;
    await page.route('**/api/file/preview/failed-cover', route => {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: failure === 'download' ? 500 : 200, contentType: 'image/png', body: 'invalid image' });
      return route.fulfill({ contentType: 'image/svg+xml', body: image });
    });
    await page.goto('/#/pages/finance/cards');
    await expect(page.locator('.cover-error')).toHaveCount(1);
    // 轻点先展开卡片，直接显示局部重试入口。
    await page.locator('.card-face').first().click({ position: { x: 40, y: 20 } });
    const editor = page.getByRole('dialog', { name: '银行卡', exact: true });
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重试封面', exact: true })).toBeVisible();
    await expect(page.locator('.card').first().locator('.face-heading')).toHaveCount(0);
    await page.getByRole('button', { name: '重试封面', exact: true }).click();
    await expect(page.locator('.cover')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.cover-error')).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}
