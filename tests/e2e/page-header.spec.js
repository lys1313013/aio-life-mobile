const { waitForMotion } = require('./support/motion');
const { stableBox } = require('./support/geometry');
const { test, expect } = require('./support/test');
const { setup } = require('./qa-platform-fixtures');

async function scrollTopOfCard(card) {
  return card.evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent.scrollTop;
    }
    throw new Error('记录卡片缺少可滚动的祖先容器');
  });
}

for (const width of [390, 768, 1280]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`导航在内容滚动时固定 ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme });
      await setup(page, true);
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: String(i + 1), userId: '0', title: `模拟目标 ${i + 1}`, type: 1,
        status: 'in_progress', currentValue: 2, targetValue: 10,
        description: '用于验证长列表滚动时导航位置的模拟内容。',
        dictType: 'fixture', dictLabel: `模拟字典 ${i + 1}`,
        sortOrder: i, isReadonly: 'N',
      }));
      await page.route('**/api/goals?*', route => route.fulfill({ json: { code: 0, data: rows } }));
      await page.route('**/api/userDictData/admin/query?*', route => route.fulfill({ json: { code: 0, data: { items: rows.map(row => ({ ...row, isEnabled: 1 })), total: rows.length } } }));
      // 分别覆盖导航在 MobilePage 内部和外部的两种用法。
      for (const [route, card] of [
        ['/pages/tasks/goals', '.record-card'],
        ['/pages/admin/index?kind=user-dict', '.user-dict-row'],
      ]) {
        await page.goto('/#' + route);
        await expect(page.locator(card)).toHaveCount(30);
        const header = page.locator('.page-navigation');
        await waitForMotion(page);
        const first = page.locator(card).first();
        // hover 等待内容实际可接收指针，避免将滚轮发送到转场快照或固定坐标处的其他区域。
        await first.hover();
        const before = await stableBox(header);
        const firstCard = await stableBox(first);
        expect(before.y).toBe(0);
        expect(firstCard.y).toBeGreaterThanOrEqual(before.height);
        const button = await stableBox(page.getByRole('button', { name: '返回', exact: true }));
        expect(button.x).toBeCloseTo(firstCard.x, 0);
        const scrollTop = await scrollTopOfCard(first);
        await page.mouse.wheel(0, 600);
        // wheel 返回不代表滚动已提交；先确认容器滚动，再通过实时 DOM 几何检查内容位移。
        await expect.poll(() => scrollTopOfCard(first)).toBeGreaterThan(scrollTop + 100);
        await expect.poll(() => first.evaluate(element => element.getBoundingClientRect().y)).toBeLessThan(firstCard.y - 100);
        expect(await stableBox(header)).toEqual(before);
        await expect(page.getByRole('button', { name: '返回', exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`${route.includes('admin') ? 'admin' : 'goals'}.png`) });
      }
    });
  }
}
