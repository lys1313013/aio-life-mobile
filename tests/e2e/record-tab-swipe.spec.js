const { test, expect } = require('@playwright/test');

test.use({ hasTouch: true });

const deviceLabels = ['手机', '电脑', '平板电脑', '手表', '显示器', '鼠标', '键盘', '耳机', '其他'];
const cases = [
  {
    name: '设备类型', route: 'goods/devices', api: 'device', param: 'type',
    tabs: ['', ...deviceLabels.map((_, index) => String(index + 1))], initial: 0,
    tab: '.device-type-tab', bar: '.device-type-scroll', card: '.goods-title-button',
    row: (value) => ({ id: '1', name: '模拟设备 ' + value, status: '1', purchasePrice: 100 }),
  },
  {
    name: '视频状态', route: 'records/video', api: 'b-video', param: 'status',
    tabs: ['not_started', 'in_progress', 'on_hold', 'completed', ''], initial: 1,
    tab: '.status-tab', bar: '.status-scroll', card: '.video-card',
    row: (value) => ({ id: '1', title: '模拟视频 ' + value, status: value || 'in_progress', duration: 100 }),
  },
];

async function touchSwipe(page, target, dx, dy = 0, cancel = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  const x = dx < 0
    ? Math.min(box.x + box.width - 18, viewport.width - 24)
    : Math.max(box.x + 18, 24);
  const y = box.y + Math.min(box.height / 2, 60);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }],
      });
      await page.waitForTimeout(25);
    }
    await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    // 等待内容回弹及手势点击抑制结束后，再开始下一次独立操作。
    await page.waitForTimeout(450);
  } finally {
    await client.detach();
  }
}

for (const scenario of cases) {
  test(`${scenario.name}内容真实横滑、空列表、边界与编辑防误触`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'tab-swipe-fixture'));
    const fulfill = (route, data) => route.fulfill({ json: { code: 0, data } });
    await page.route('**/api/auth/secondary-lock/menus', route => fulfill(route, []));
    await page.route('**/api/userDictType/getByDictType?*', route => fulfill(route, {
      dictDetailList: deviceLabels.map((dictLabel, index) => ({ id: String(index + 1), dictLabel })),
    }));
    await page.route('**/api/sysDictType/getByDictType?*', route => fulfill(route, {
      dictDetailList: [{ value: '1', label: '使用中' }],
    }));
    await page.route('**/api/b-video/getStatusCount', route => fulfill(route, { in_progress: 1 }));
    await page.route('**/api/b-video/statistics', route => fulfill(route, { studiedSeconds: 20 }));
    const requests = [];
    const emptyIndex = scenario.initial + 1;
    let fail = false;
    await page.route(`**/api/${scenario.api}/query?*`, route => {
      const value = new URL(route.request().url()).searchParams.get(scenario.param) || '';
      requests.push(value);
      if (fail) return route.fulfill({ json: { code: 1, message: '模拟分类加载失败' } });
      const items = value === scenario.tabs[emptyIndex] ? [] : [scenario.row(value)];
      return fulfill(route, { items, total: items.length });
    });
    await page.goto('/#/pages/' + scenario.route);
    const surface = page.locator('.tab-swipe-surface');
    const tabs = page.locator(scenario.tab);
    await expect(page.locator(scenario.card)).toHaveCount(1);
    await expect(tabs.nth(scenario.initial)).toHaveAttribute('aria-pressed', 'true');

    // 卡片横滑应切换至相邻空分类，不能顺便打开编辑。
    await touchSwipe(page, page.locator(scenario.card).first(), -120);
    await expect(tabs.nth(emptyIndex)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('暂无记录', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(requests.at(-1)).toBe(scenario.tabs[emptyIndex]);

    const beforeIgnored = requests.length;
    await touchSwipe(page, surface, 25);
    await touchSwipe(page, surface, 5, -60);
    await touchSwipe(page, surface, -120, 0, true);
    expect(requests).toHaveLength(beforeIgnored);
    await expect(tabs.nth(emptyIndex)).toHaveAttribute('aria-pressed', 'true');
    await touchSwipe(page, surface, 120);
    await expect(tabs.nth(scenario.initial)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(scenario.card)).toHaveCount(1);

    // 正常点击仍可编辑，弹窗中的横滑不切换后台列表。
    await page.locator(scenario.card).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const beforeDialog = requests.length;
    await touchSwipe(page, dialog, -120);
    expect(requests).toHaveLength(beforeDialog);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();

    // 首尾停止，不循环；从倒数第二项滑到末项时，标签应自动可见。
    await tabs.first().click();
    await expect(page.locator(scenario.card)).toHaveCount(1);
    await touchSwipe(page, surface, 120);
    await expect(tabs.first()).toHaveAttribute('aria-pressed', 'true');
    await tabs.nth(scenario.tabs.length - 2).click();
    await expect.poll(() => requests.at(-1)).toBe(scenario.tabs.at(-2));
    await expect(page.locator('.loading-indicator')).toHaveCount(0);
    await touchSwipe(page, surface, -120);
    await expect(tabs.last()).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const selected = await tabs.last().boundingBox();
      const bar = await page.locator(scenario.bar).boundingBox();
      return selected.x >= bar.x - 1 && selected.x + selected.width <= bar.x + bar.width + 1;
    }).toBe(true);
    const beforeBoundary = requests.length;
    await touchSwipe(page, surface, -120);
    expect(requests).toHaveLength(beforeBoundary);

    // 失败页保留切换能力，返回相邻分类可重新加载。
    fail = true;
    await touchSwipe(page, surface, 120);
    await expect(page.getByText('模拟分类加载失败', { exact: true })).toBeVisible();
    fail = false;
    await touchSwipe(page, surface, -120);
    await expect(page.getByText('模拟分类加载失败', { exact: true })).toHaveCount(0);
    await expect(tabs.last()).toHaveAttribute('aria-pressed', 'true');
  });
}
