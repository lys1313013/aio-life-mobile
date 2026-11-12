const { waitForMotion } = require('./support/motion');
const { test, expect } = require('./support/test');
const themes = require('../../src/theme.json');
const ok = data => ({ json: { code: 0, data } });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`资料骨架与表单位置一致 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'profile-loading-fixture'));
    const pending = gate(); let delayed = true;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    apiMock({
      'GET /api/user/info': async () => { if (delayed) await pending.promise; return ok({ id: '1', nickname: '模拟用户', introduction: '模拟签名', email: 'mock@example.com', roles: [] }); },
      'GET /api/auth/secondary-lock/menus': ok([]),
      'PUT /api/users': () => ({ json: { code: 1, message: '模拟保存失败' } }),
    });
    try {
      await page.goto('/#/pages/profile/settings');
      const card = page.locator('.settings-card');
      await expect(page.getByRole('status', { name: '正在加载个人资料' })).toBeVisible();
      const initial = await card.boundingBox();
      const regions = ['.avatar-section', '.settings-inline-row', '.settings-textarea'];
      const loadingRegions = await Promise.all(regions.map(selector => card.locator(selector).evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }))));
      await expect(card.locator('.settings-avatar')).toHaveCSS('border-radius', '36px');
      expect((await card.locator('.settings-skeleton-avatar-action .settings-placeholder').boundingBox()).height).toBeLessThan(44);
      const savePlaceholder = await card.locator('.settings-skeleton-save').boundingBox();
      const color = themes[theme].skeletonColor.match(/[a-f\d]{2}/gi).map(part => parseInt(part, 16));
      await expect(card.locator('.settings-skeleton-save')).toHaveCSS('background-color', `rgb(${color.join(', ')})`);
      await page.screenshot({ path: info.outputPath('settings-loading.png') });
      delayed = false; pending.release();
      await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('模拟用户');
      expect(Math.abs((await card.boundingBox()).height - initial.height)).toBeLessThanOrEqual(1);
      for (const [index, selector] of regions.entries()) {
        const loaded = await card.locator(selector).evaluateAll(nodes => nodes.map(node => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }));
        expect(loaded).toHaveLength(loadingRegions[index].length);
        loaded.forEach((box, row) => {
          for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(box[key] - loadingRegions[index][row][key]), `${selector} ${row} ${key}`).toBeLessThanOrEqual(1);
        });
      }
      const loadedSave = await page.getByRole('button', { name: '保存', exact: true }).boundingBox();
      for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(loadedSave[key] - savePlaceholder[key]), `保存 ${key}`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('settings-loaded.png') });
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('模拟保存失败');
      await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('模拟用户');
      expect(errors).toEqual([]);
    } finally { pending.release(); }
  });
  test(`绑定刷新保留空态 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'profile-loading-fixture'));
    let pending = gate(), delayed = false, fail = false;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', introduction: '模拟签名', email: 'mock@example.com', roles: [] }),
      'GET /api/userbinds/list': async () => { if (delayed) await pending.promise; return fail ? { json: { code: 1, message: '模拟刷新失败' } } : ok([]); },
      'GET /api/auth/secondary-lock/menus': ok([]),
    });
    try {
      await page.goto('/#/pages/profile/bindings');
      const empty = page.locator('.state-card');
      await expect(empty).toContainText('还没有绑定账号');
      const oldHeight = (await empty.boundingBox()).height;
      pending = gate(); delayed = true; fail = true;
      await waitForMotion(page);
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        const box = await page.locator('.tab-scroll').boundingBox();
        const x = box.x + box.width / 2, y = box.y + 40;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step * 18 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(page.locator('.page-state')).toHaveAttribute('aria-busy', 'true');
        await expect(empty).toBeVisible();
        expect((await empty.boundingBox()).height).toBeCloseTo(oldHeight, 0);
        await expect(page.locator('.page-state-placeholder')).toHaveCount(0);
        delayed = false; pending.release();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(empty).toBeVisible();
        fail = false;
        await page.getByRole('button', { name: '重试', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(empty).toBeVisible();
        await page.screenshot({ path: info.outputPath('bindings-empty.png') });
      } finally { pending.release(); await touch.detach(); }
      expect(errors).toEqual([]);
    } finally { pending.release(); }
  });
}
