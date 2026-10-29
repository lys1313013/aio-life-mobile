const { test, expect } = require('./support/test');
const { setup } = require('./qa-domains-fixtures');

const labels = ['手机', '电脑', '平板电脑', '手表', '显示器', '鼠标', '键盘', '耳机', '其他'];

for (const width of [390, 768, 1440]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`设备类型横滑和筛选 ${width} ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await setup(page);
      await page.route('**/api/userDictType/getByDictType?*', route => route.fulfill({
        json: { code: 0, data: { dictDetailList: [...labels, '相机'].map((dictLabel, index) => ({ id: String(index + 1), dictLabel })) } },
      }));
      let requests = 0;
      await page.route('**/api/device/query?*', route => {
        requests++;
        return route.fulfill({ json: { code: 0, data: {
          items: labels.map((label, index) => ({ id: String(index + 1), type: String(index + 1), name: `模拟${label}`, purchasePrice: 100, status: '1' })), total: labels.length,
        } } });
      });
      await page.goto('/#/pages/goods/devices');
      await expect(page.locator('.device-page-active').getByText('模拟手机', { exact: true })).toBeVisible();
      await expect(page.locator('.device-page-active .goods-card')).toHaveCount(labels.length);
      await expect(page.getByRole('button', { name: '相机', exact: true })).toHaveCount(0);
      const pager = page.locator('.device-pager');
      const pagerBox = await pager.boundingBox();
      expect(pagerBox.height).toBeGreaterThan(400);
      // 普通鼠标从设备标题按住拖动，不能选中文字或在松手时打开编辑。
      const title = await page.locator('.device-page-active .goods-title-button').nth(width < 700 ? 1 : width < 1000 ? 2 : 3).boundingBox();
      await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
      await page.mouse.down();
      await page.mouse.move(pagerBox.x + 10, title.y + title.height / 2, { steps: 12 });
      expect((await page.locator('.device-page-content').nth(0).boundingBox()).x).toBeLessThan(pagerBox.x);
      await page.mouse.up();
      await expect(page.getByRole('button', { name: '手机', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: '全部', exact: true }).click();
      await expect.poll(async () => Math.abs((await page.locator('.device-page-content').nth(0).boundingBox()).x - pagerBox.x)).toBeLessThan(1);
      if (width === 390) {
        const tabs = page.locator('.device-type-scroll .uni-scroll-view').last();
        const tabBox = await tabs.boundingBox();
        await page.mouse.move(tabBox.x + tabBox.width - 20, tabBox.y + tabBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(tabBox.x + 20, tabBox.y + tabBox.height / 2, { steps: 12 });
        await page.mouse.up();
        await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
        await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await page.mouse.move(tabBox.x + 20, tabBox.y + tabBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(tabBox.x + tabBox.width - 20, tabBox.y + tabBox.height / 2, { steps: 12 });
        await page.mouse.up();
        await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBe(0);
      }
      const touch = await page.context().newCDPSession(page);
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      const x = pagerBox.x + pagerBox.width * 0.8;
      const y = pagerBox.y + 70;
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - pagerBox.width * 0.5 * step / 8, y }] });
      }
      // 手指未松开时必须看到两个真实页面同时移动，而不是松手后换列表。
      const panes = page.locator('.device-page-content');
      await expect.poll(async () => (await panes.nth(1).boundingBox()).x).toBeLessThan(pagerBox.x + pagerBox.width * 0.8);
      expect((await panes.nth(0).boundingBox()).x).toBeLessThan(pagerBox.x);
      await page.screenshot({ path: `test-results/device-page-drag-${width}-${colorScheme}.png` });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.getByRole('button', { name: '手机', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => Math.abs((await panes.nth(1).boundingBox()).x - pagerBox.x)).toBeLessThan(1);
      await expect(page.locator('.device-page-active .goods-card')).toHaveCount(1);
      await page.getByRole('button', { name: '全部', exact: true }).click();
      await expect.poll(async () => Math.abs((await panes.nth(0).boundingBox()).x - pagerBox.x)).toBeLessThan(1);
      // 首页向右越界有阻尼，松手回到原页，不能绕到最后一类。
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pagerBox.x + 30, y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pagerBox.x + 150, y }] });
      await expect.poll(async () => (await panes.nth(0).boundingBox()).x).toBeGreaterThan(pagerBox.x);
      expect((await panes.nth(0).boundingBox()).x - pagerBox.x).toBeLessThan(120);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => Math.abs((await panes.nth(0).boundingBox()).x - pagerBox.x)).toBeLessThan(1);
      await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
      // 纵向拖动仍滚动当前设备列表，不误切分类。
      const listScroll = page.locator('.device-pager .category-pager-scroll').nth(0).locator('.uni-scroll-view').last();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: pagerBox.y + 500 }] });
      for (let step = 1; step <= 8; step++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: pagerBox.y + 500 - step * 30 }] });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => listScroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const scroll = page.locator('.device-type-scroll .uni-scroll-view').last();
      const box = await scroll.boundingBox();
      const sizes = await scroll.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      if (width === 390) {
        expect(sizes.scroll, '全部类型必须撑开内容宽度，形成真实滚动区域').toBeGreaterThan(sizes.width);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 20, y: box.y + box.height / 2 }] });
        for (let step = 1; step <= 8; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 20 - (box.width - 40) * step / 8, y: box.y + box.height / 2 }] });
          await page.waitForTimeout(30);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      }
      const last = page.getByRole('button', { name: '其他', exact: true });
      // 点击前检查可见范围，避免 Playwright 自动滚动掩盖横滑失败。
      await expect.poll(async () => {
        const lastBox = await last.boundingBox();
        return lastBox.x >= box.x && lastBox.x + lastBox.width <= box.x + box.width + 1;
      }).toBe(true);
      const beforeSelection = await scroll.evaluate(el => el.scrollLeft);
      await last.click();
      await expect(page.locator('.device-page-active').getByText('模拟其他', { exact: true })).toBeVisible();
      await expect(page.locator('.device-page-active .goods-card')).toHaveCount(1);
      await expect(last).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.device-type-tab')).toHaveCount(labels.length + 1);
      expect(requests, '切换分类复用已加载设备，不重新请求或触发加载闪烁').toBe(1);
      expect(await scroll.evaluate(el => el.scrollLeft), '选中分类应保留横向滚动位置').toBeCloseTo(beforeSelection, 0);
      await page.screenshot({ path: `test-results/device-type-scroll-${width}-${colorScheme}.png` });
    });
  }
}
