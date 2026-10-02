const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');
const path = require('node:path');
const out = path.resolve('artifacts/bank-card-stack');

test.use({ hasTouch: true });

async function prepare(page, baseURL, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  const state = await setup(page, baseURL, null);
  state.cards = Array.from({ length: 7 }, (_, i) => ({ ...state.cards[0], id: String(88 + i), bankName: `模拟银行 ${i + 1}`, cardName: `模拟卡 ${i + 1}`, sortOrder: i, coverColor: ['#334766', '#38605C', '#685174', '#87534F', '#716348', '#414854'][i % 6] }));
  await page.goto('/#/pages/finance/cards');
  await expect(page.locator('.card-stack .card')).toHaveCount(7);
  return state;
}
async function gap(page) {
  return page.locator('.card-stack .card').evaluateAll(nodes => nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top);
}
async function touch(cdp, type, x = 0, y = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
}
async function startHeld(page, cdp, x, y) {
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(280); // 真实按住，超过页面接管拖动的等待时间。
  await expect(page.locator('.card-face-dragging').first()).toBeVisible();
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`卡包原生触摸连续展开与收拢 ${width} ${theme}`, async ({ page, baseURL }) => {
    const state = await prepare(page, baseURL, width, theme);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let cardRequests = 0;
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/bank-cards') cardRequests++; });
    const cdp = await page.context().newCDPSession(page);
    const face = await page.locator('.card-face').first().boundingBox();
    const x = face.x + 80, y = face.y + 28;
    const initial = await gap(page);
    await startHeld(page, cdp, x, y);
    const samples = [];
    for (const dy of [30, 65, 100]) {
      await touch(cdp, 'touchMove', x, y + dy);
      await expect.poll(() => gap(page)).toBeGreaterThan(initial + dy - 2);
      samples.push(await gap(page));
    }
    expect(samples[1] - samples[0]).toBeCloseTo(35, 0);
    expect(samples[2] - samples[1]).toBeCloseTo(35, 0);
    await touch(cdp, 'touchEnd');
    await expect(page.locator('.card-face-dragging')).toHaveCount(0);
    await page.waitForTimeout(480);
    expect(await gap(page)).toBeCloseTo(samples[2], 0); // 松手停留，不吸附也不误点展开。
    await expect(page.locator('.card-stack-expanded')).toHaveCount(0);
    await page.screenshot({ path: `${out}/${width}-${theme}-partial.png`, fullPage: true });
    await startHeld(page, cdp, x, y);
    await touch(cdp, 'touchMove', x, y + 320);
    await touch(cdp, 'touchEnd');
    const full = await gap(page);
    expect(full).toBeCloseTo(face.height + 12, 0);
    const separate = await page.locator('.card-face').evaluateAll(nodes => nodes.every((n, i) => i === 0 || n.getBoundingClientRect().top > nodes[i - 1].getBoundingClientRect().bottom));
    expect(separate).toBe(true);
    await page.screenshot({ path: `${out}/${width}-${theme}-separated.png`, fullPage: true });
    // 分段上推逐步收拢；越过边界后反向拖动立即响应。
    await startHeld(page, cdp, x, y + 160);
    await touch(cdp, 'touchMove', x, y + 80);
    expect(await gap(page)).toBeCloseTo(full - 80, 0);
    await touch(cdp, 'touchMove', x, y - 20);
    const nearClosed = await gap(page);
    await touch(cdp, 'touchMove', x, y + 10);
    expect(await gap(page)).toBeGreaterThan(nearClosed);
    await touch(cdp, 'touchCancel');
    await expect(page.locator('.card-face-dragging')).toHaveCount(0);
    await page.getByRole('button', { name: '切换为平铺视图' }).click();
    await expect(page.getByRole('button', { name: /^编辑银行卡/ })).toHaveCount(7);
    expect(cardRequests).toBe(0); // 卡包拖动未误触下拉刷新。
    expect(state.calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('卡包短划正常滚动、触摸取消恢复、鼠标拖动', async ({ page, baseURL }) => {
  await prepare(page, baseURL, 390, 'light');
  const cdp = await page.context().newCDPSession(page);
  const face = await page.locator('.card-face').first().boundingBox();
  const x = face.x + 80, y = face.y + 28;
  await startHeld(page, cdp, x, y);
  await touch(cdp, 'touchMove', x, y + 300);
  await touch(cdp, 'touchEnd');
  const full = await gap(page);
  const scroller = page.locator('.mobile-page-scroll .uni-scroll-view');
  await touch(cdp, 'touchStart', x, 620);
  for (const top of [580, 520, 460, 400, 340]) await touch(cdp, 'touchMove', x, top);
  await touch(cdp, 'touchEnd');
  await expect.poll(() => scroller.evaluateAll(nodes => Math.max(...nodes.map(n => n.scrollTop)))).toBeGreaterThan(50);
  expect(await gap(page)).toBeCloseTo(full, 0);
  await page.getByRole('button', { name: '切换为平铺视图' }).click();
  await page.getByRole('button', { name: '切换为堆叠视图' }).click();
  await page.waitForTimeout(800); // 避开触摸之后的兼容鼠标事件窗口。
  await page.locator('.card-face').first().scrollIntoViewIfNeeded();
  const first = await page.locator('.card-face').first().boundingBox();
  await page.mouse.move(first.x + 80, first.y + 120);
  await page.mouse.down();
  await page.waitForTimeout(280);
  await expect(page.locator('.card-face-dragging').first()).toBeVisible();
  await page.mouse.move(first.x + 80, first.y + 40, { steps: 8 });
  await page.mouse.up();
  expect(await gap(page)).toBeLessThan(full - 60);
  await expect(page.locator('.card-stack-expanded')).toHaveCount(0);
  await expect(page.locator('.card-face-dragging')).toHaveCount(0);
});
