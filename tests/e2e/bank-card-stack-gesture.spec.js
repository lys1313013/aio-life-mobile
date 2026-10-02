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
async function startGesture(page, cdp, x, y) {
  await touch(cdp, 'touchStart', x, y);
  // 不停留，后续第一段位移必须直接开始拖动。
}
async function settled(page) {
  await expect(page.locator('.card-stack-rebounding')).toHaveCount(0);
}

async function sampleRebound(page) {
  return page.evaluate(() => new Promise(resolve => {
    const started = performance.now(), samples = [];
    function frame() {
      const nodes = document.querySelectorAll('.card-stack .card');
      samples.push(nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top);
      if (performance.now() - started < 650) requestAnimationFrame(frame);
      else resolve(samples);
    }
    frame();
  }));
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`卡片起手下拉不刷新，结束或取消后卡片外可刷新 ${width} ${theme}`, async ({ page, baseURL }) => {
    await prepare(page, baseURL, width, theme);
    // 直接下拉现在会展开整组，留出可见的卡包外区域验证刷新。
    await page.setViewportSize({ width, height: 2400 });
    const cdp = await page.context().newCDPSession(page);
    let cardRequests = 0;
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/bank-cards') cardRequests++; });
    const face = await page.locator('.card-face').first().boundingBox();
    const x = face.x + 80, y = face.y + 28;
    const initial = await gap(page);
    for (const ending of ['touchEnd', 'touchCancel']) {
      const before = cardRequests;
      // 直接下拉应展开卡包，不能把手势移交给刷新，也不能误开编辑。
      await touch(cdp, 'touchStart', x, y);
      for (const dy of [20, 60, 110, 170]) await touch(cdp, 'touchMove', x, y + dy);
      expect((await page.locator('.card-face').first().boundingBox()).y).toBeCloseTo(face.y, 0);
      await touch(cdp, ending);
      await expect(page.locator('.card-face-dragging')).toHaveCount(0);
      await settled(page);
      expect(await gap(page)).toBeGreaterThan(initial);
      await expect(page.getByRole('dialog', { name: '银行卡', exact: true })).toHaveCount(0);
      expect(cardRequests).toBe(before);

      // 卡包下方留白属于滚动容器，确认禁用状态没有遗留到下一次手势。
      const last = await page.locator('.card').last().boundingBox();
      const outsideY = last.y + last.height + 40;
      expect(outsideY + 170).toBeLessThan(2400);
      await touch(cdp, 'touchStart', width / 2, outsideY);
      for (const dy of [20, 60, 110, 170]) await touch(cdp, 'touchMove', width / 2, outsideY + dy);
      await touch(cdp, 'touchEnd');
      await expect.poll(() => cardRequests).toBe(before + 1);
      await expect.poll(async () => (await page.locator('.card-face').first().boundingBox()).y).toBeCloseTo(face.y, 0);
    }
    // 拖动后的下一次真实轻点先展开；微小手抖不应被判为拖动。
    await touch(cdp, 'touchStart', x, y);
    await touch(cdp, 'touchMove', x + 2, y + 2);
    await touch(cdp, 'touchEnd');
    const editor = page.getByRole('dialog', { name: '银行卡', exact: true });
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.card-face').first()).toHaveAttribute('aria-expanded', 'true');
    // 展开后再次轻点收起，不打开编辑。
    await touch(cdp, 'touchStart', x, y);
    await touch(cdp, 'touchEnd');
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.card-face').first()).toHaveAttribute('aria-expanded', 'false');
  });

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
    await startGesture(page, cdp, x, y);
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
    await startGesture(page, cdp, x, y);
    await touch(cdp, 'touchMove', x, y + 320);
    const stretched = await gap(page);
    expect(stretched).toBeGreaterThan(face.height + 12 + 3);
    expect(stretched).toBeLessThan(face.height + 12 + 20);
    await page.screenshot({ path: `${out}/${width}-${theme}-elastic.png` });
    await touch(cdp, 'touchEnd');
    const rebound = await sampleRebound(page);
    await settled(page);
    const full = await gap(page);
    expect(full).toBeCloseTo(face.height + 12, 0);
    expect(Math.min(...rebound)).toBeLessThan(full - 0.2); // 轻微越过原位，再回到边界。
    const separate = await page.locator('.card-face').evaluateAll(nodes => nodes.every((n, i) => i === 0 || n.getBoundingClientRect().top > nodes[i - 1].getBoundingClientRect().bottom));
    expect(separate).toBe(true);
    await page.screenshot({ path: `${out}/${width}-${theme}-separated.png`, fullPage: true });
    // 分段上推逐步收拢；越过边界后反向拖动立即响应。
    await startGesture(page, cdp, x, y + 160);
    await touch(cdp, 'touchMove', x, y + 80);
    expect(await gap(page)).toBeCloseTo(full - 80, 0);
    await touch(cdp, 'touchMove', x, y - 20);
    const nearClosed = await gap(page);
    await touch(cdp, 'touchMove', x, y + 10);
    expect(await gap(page)).toBeGreaterThan(nearClosed);
    await touch(cdp, 'touchCancel');
    await expect(page.locator('.card-face-dragging')).toHaveCount(0);
    await settled(page);

    // 收拢端同样有阻尼，拉得更远时增量变小，且保留可点选区域。
    await startGesture(page, cdp, x, y + 160);
    await touch(cdp, 'touchMove', x, y + 110);
    const compressed = await gap(page);
    await touch(cdp, 'touchMove', x, y + 60);
    const compressedMore = await gap(page);
    await touch(cdp, 'touchMove', x, y + 10);
    const compressedMost = await gap(page);
    expect(compressed).toBeLessThan(initial);
    expect(compressedMore).toBeLessThan(compressed);
    expect(compressedMost).toBeGreaterThanOrEqual(44);
    expect(compressedMore - compressedMost).toBeLessThan(compressed - compressedMore);
    await touch(cdp, 'touchEnd');
    const lowerRebound = await sampleRebound(page);
    await settled(page);
    expect(await gap(page)).toBeCloseTo(initial, 0);
    expect(Math.max(...lowerRebound)).toBeGreaterThan(initial + 0.2);
    await page.getByRole('button', { name: '切换为平铺视图' }).click();
    await expect(page.getByRole('button', { name: '银行卡更多操作', exact: true })).toHaveCount(7);
    expect(cardRequests).toBe(0); // 卡包拖动未误触下拉刷新。
    expect(state.calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('卡包外正常滚动、触摸取消恢复、鼠标直接拖动', async ({ page, baseURL }) => {
  await prepare(page, baseURL, 768, 'light');
  const cdp = await page.context().newCDPSession(page);
  const face = await page.locator('.card-face').first().boundingBox();
  const x = face.x + 80, y = face.y + 28;
  await startGesture(page, cdp, x, y);
  await touch(cdp, 'touchMove', x, y + 300);
  await touch(cdp, 'touchEnd');
  await settled(page);
  const full = await gap(page);
  const scroller = page.locator('.mobile-page-scroll .uni-scroll-view');
  await touch(cdp, 'touchStart', 60, 620);
  for (const top of [580, 520, 460, 400, 340]) await touch(cdp, 'touchMove', 60, top);
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
  await page.mouse.move(first.x + 80, first.y + 40, { steps: 8 });
  await expect(page.locator('.card-face-dragging').first()).toBeVisible();
  await page.mouse.up();
  expect(await gap(page)).toBeLessThan(full - 60);
  await expect(page.locator('.card-stack-expanded')).toHaveCount(0);
  await expect(page.locator('.card-face-dragging')).toHaveCount(0);
});

test('回弹中可重新接住，触摸取消与切换视图不残留动画', async ({ page, baseURL }) => {
  await prepare(page, baseURL, 390, 'light');
  const cdp = await page.context().newCDPSession(page);
  const face = await page.locator('.card-face').first().boundingBox();
  const x = face.x + 80, y = face.y + 28;
  await startGesture(page, cdp, x, y);
  await touch(cdp, 'touchMove', x, y + 300);
  await touch(cdp, 'touchEnd');
  await expect(page.locator('.card-stack-rebounding')).toHaveCount(1);
  await touch(cdp, 'touchStart', x, y + 140);
  const caught = await gap(page);
  await page.waitForTimeout(280);
  expect(await gap(page)).toBeCloseTo(caught, 0);
  await touch(cdp, 'touchMove', x, y + 80);
  expect(await gap(page)).toBeLessThan(caught);
  await touch(cdp, 'touchMove', x, y + 300);
  await touch(cdp, 'touchCancel');
  await expect(page.locator('.card-stack-rebounding')).toHaveCount(1);
  await page.getByRole('button', { name: '切换为平铺视图' }).click();
  await expect(page.locator('.card-stack-rebounding')).toHaveCount(0);
  await page.getByRole('button', { name: '切换为堆叠视图' }).click();
  const full = await gap(page);
  expect(full).toBeCloseTo(face.height + 12, 0);
  await page.waitForTimeout(650);
  expect(await gap(page)).toBeCloseTo(full, 0);
});
