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
      await expect(page.getByText('模拟手机', { exact: true })).toBeVisible();
      await expect(page.locator('.goods-card')).toHaveCount(labels.length);
      await expect(page.getByRole('button', { name: '相机', exact: true })).toHaveCount(0);
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
      await expect(page.getByText('模拟其他', { exact: true })).toBeVisible();
      await expect(page.locator('.goods-card')).toHaveCount(1);
      await expect(last).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.device-type-tab')).toHaveCount(labels.length + 1);
      expect(requests, '切换分类复用已加载设备，不重新请求或触发加载闪烁').toBe(1);
      expect(await scroll.evaluate(el => el.scrollLeft), '选中分类应保留横向滚动位置').toBeCloseTo(beforeSelection, 0);
      await page.screenshot({ path: `test-results/device-type-scroll-${width}-${colorScheme}.png` });
    });
  }
}
