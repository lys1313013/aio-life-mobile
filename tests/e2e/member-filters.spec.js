const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test.use({ hasTouch: true });
const records = [
  { id: '9223372036854775801', name: '模拟 ChatGPT', category: 'AI', providerIconKey: 'chatgpt', status: 'active', remainingDays: 30 },
  { id: '9223372036854775802', name: '模拟迅雷', category: 'video', providerIconKey: 'xunlei', status: 'expiring', remainingDays: 3 },
  { id: '9223372036854775803', name: '模拟网易云音乐', category: 'music', providerIconKey: 'netease_music', status: 'active', remainingDays: 100 },
  { id: '9223372036854775804', name: '模拟京东 Plus', category: 'shopping', providerIconKey: 'jd', status: 'active', remainingDays: 180 },
  { id: '9223372036854775805', name: '模拟 Kimi', category: 'AI', providerIconKey: 'kimi', status: 'expired', remainingDays: -30 },
  { id: '9223372036854775806', name: '模拟爱奇艺', category: 'video', providerIconKey: 'iqiyi', status: 'expired', remainingDays: -20 },
  { id: '9223372036854775807', name: '模拟学习会员', category: 'study', status: 'expired', remainingDays: -10 },
].map(row => ({ ...row, provider: row.name, startDate: '2026-10-01', expiryDate: '2027-01-01', price: 30, monthlyAmount: 30, billingCycle: 'month', autoRenew: 0 }));

async function prepare(page) {
  const state = { members: records.map(row => ({ ...row })), reads: 0, fail: false, writes: [] };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'membership-filter-fixture'));
  const fulfill = (route, data) => route.fulfill({ json: { code: 0, data } });
  await page.route('**/api/auth/secondary-lock/menus', route => fulfill(route, []));
  await page.route('**/api/quick-nav/candidates?client=mobile', route => fulfill(route, [{ menuId: 'member', path: '/membership', title: '订阅' }]));
  await page.route('**/api/menu/preferences?client=mobile', route => fulfill(route, { menus: [{ id: 'member', title: '订阅', children: [] }], hiddenMenuIds: [] }));
  await page.route('**/api/membership/list', route => {
    state.reads++;
    return state.fail ? route.fulfill({ json: { code: 1, message: '模拟会员加载失败' } }) : fulfill(route, state.members);
  });
  await page.route('**/api/membership/stats', route => fulfill(route, { activeCount: 3, expiringCount: 1, expiredCount: 3, expiringThisMonthCount: 1, monthlyAmount: 120 }));
  await page.route('**/api/membership/providers', route => fulfill(route, []));
  await page.route('**/api/membership/provider-icons/*', route => {
    const url = new URL(route.request().url());
    const key = url.pathname.split('/').at(-1);
    const suffix = url.searchParams.get('dark') === 'true' && ['chatgpt', 'kimi'].includes(key) ? '_dark' : '';
    const icon = path.resolve(__dirname, '../../../aio-life-server/src/main/resources/static/membership-icons', key + suffix + '.png');
    return fs.existsSync(icon) ? route.fulfill({ path: icon, contentType: 'image/png' }) : route.fulfill({ status: 404 });
  });
  await page.route('**/api/membership', route => {
    const body = route.request().postDataJSON();
    state.writes.push(body);
    const saved = { ...state.members.find(row => row.id === body.id), ...body, status: 'expired', remainingDays: -1 };
    state.members = state.members.map(row => row.id === saved.id ? saved : row);
    return fulfill(route, saved);
  });
  await page.goto('/#/pages/member/index');
  await expect(page.locator('.member-card')).toHaveCount(4);
  return state;
}

async function touchSwipe(page, target, dx, dy = 0, cancel = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  const x = dx < 0 ? Math.min(box.x + box.width - 18, viewport.width - 24) : Math.max(box.x + 18, 24);
  const y = box.y + Math.min(box.height / 2, 60);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
      await page.waitForTimeout(25);
    }
    await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(450);
  } finally { await client.detach(); }
}
const tabs = page => page.locator('.member-category-tab');
const expiredSwitch = page => page.getByRole('switch', { name: '包含过期', exact: true });
const names = page => tabs(page).evaluateAll(buttons => buttons.map(button => [button.querySelector('.member-category-label').textContent, button.querySelector('.member-category-count').textContent].map(text => text.trim()).join(' ')));

test('订阅分类真实横滑、首尾停止与编辑防误触', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await prepare(page);
  const surface = page.locator('.tab-swipe-surface');
  await expect(expiredSwitch(page)).toHaveAttribute('aria-checked', 'false');
  expect(await names(page)).toEqual(['全部 4', 'AI 1', '视频 1', '音乐 1', '购物 1']);
  await touchSwipe(page, page.locator('.member-card').first(), -120);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '编辑订阅：模拟 ChatGPT', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const reads = state.reads;
  await touchSwipe(page, surface, 25);
  await touchSwipe(page, surface, 5, -60);
  await touchSwipe(page, surface, -120, 0, true);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await touchSwipe(page, surface, -120);
  await expect(tabs(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '编辑订阅：模拟迅雷', exact: true })).toBeVisible();
  await touchSwipe(page, surface, 120);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(state.reads).toBe(reads);
  await page.locator('.member-card').click();
  const dialog = page.getByRole('dialog', { name: '编辑订阅', exact: true });
  await expect(dialog).toBeVisible();
  await touchSwipe(page, dialog, -120);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await tabs(page).first().click();
  await touchSwipe(page, surface, 120);
  await expect(tabs(page).first()).toHaveAttribute('aria-pressed', 'true');
  await tabs(page).nth(3).click();
  await touchSwipe(page, surface, -120);
  await expect(tabs(page).last()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const selected = await tabs(page).last().boundingBox();
    const bar = await page.locator('.member-category-scroll').boundingBox();
    return selected.x >= bar.x - 1 && selected.x + selected.width <= bar.x + bar.width + 1;
  }).toBe(true);
  await touchSwipe(page, surface, -120);
  await expect(tabs(page).last()).toHaveAttribute('aria-pressed', 'true');
});

test('包含过期与分类联动、保存后退回全部、空态和失败重试', async ({ page }) => {
  const state = await prepare(page);
  await expiredSwitch(page).click();
  await expect(page.locator('.member-card')).toHaveCount(7);
  expect(await names(page)).toEqual(['全部 7', 'AI 2', '视频 2', '音乐 1', '购物 1', '学习 1']);
  await tabs(page).last().click();
  await expect(page.locator('.member-card')).toHaveCount(1);
  await expiredSwitch(page).click();
  await expect(tabs(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.member-card')).toHaveCount(4);
  await tabs(page).nth(1).click();
  await page.locator('.member-card').click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(tabs(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.member-card')).toHaveCount(3);
  expect(state.writes.at(-1).id).toBe(records[0].id);
  state.members = records.filter(row => row.status === 'expired');
  await page.reload();
  await expect(page.getByText('暂无生效中的会员', { exact: true })).toBeVisible();
  expect(await names(page)).toEqual(['全部 0']);
  await expiredSwitch(page).click();
  await expect(page.locator('.member-card')).toHaveCount(3);
  state.members = [];
  await page.reload();
  await expect(page.getByText('暂无会员', { exact: true })).toBeVisible();
  await touchSwipe(page, page.locator('.tab-swipe-surface'), -120);
  await expect(tabs(page).first()).toHaveAttribute('aria-pressed', 'true');
  state.fail = true;
  await page.reload();
  await expect(page.getByText('模拟会员加载失败', { exact: true })).toBeVisible();
  state.fail = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('暂无会员', { exact: true })).toBeVisible();
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`订阅分类布局 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepare(page);
    for (const included of [false, true]) {
      if (included) await expiredSwitch(page).click();
      await expect(page.locator('.member-card')).toHaveCount(included ? 7 : 4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      const switchBox = await expiredSwitch(page).boundingBox();
      const scrollBox = await page.locator('.member-category-scroll').boundingBox();
      expect(switchBox.height).toBeGreaterThanOrEqual(44);
      expect(switchBox.x).toBeGreaterThanOrEqual(scrollBox.x + scrollBox.width);
      expect(switchBox.x + switchBox.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/member-filters/${width}-${theme}-${included ? 'included' : 'active'}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
