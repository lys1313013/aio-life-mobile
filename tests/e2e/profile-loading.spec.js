const { test, expect } = require('./support/test');
const ok = data => ({ json: { code: 0, data } });
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`资料骨架与绑定刷新保留空态 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'profile-loading-fixture'));
    let pending = gate(), delayed = true, fail = false;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    apiMock({
      'GET /api/user/info': async () => { if (delayed) await pending.promise; return ok({ id: '1', nickname: '模拟用户', introduction: '模拟签名', email: 'mock@example.com', roles: [] }); },
      'GET /api/userbinds/list': async () => { if (delayed) await pending.promise; return fail ? { json: { code: 1, message: '模拟刷新失败' } } : ok([]); },
      'GET /api/auth/secondary-lock/menus': ok([]),
      'PUT /api/users': () => ({ json: { code: 1, message: '模拟保存失败' } }),
    });
    try {
      await page.goto('/#/pages/profile/settings');
      const card = page.locator('.settings-card');
      await expect(page.getByRole('status', { name: '正在加载个人资料' })).toBeVisible();
      const initial = await card.boundingBox();
      await page.screenshot({ path: info.outputPath('settings-loading.png') });
      delayed = false; pending.release();
      await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('模拟用户');
      expect(Math.abs((await card.boundingBox()).height - initial.height)).toBeLessThan(20);
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('模拟保存失败');
      await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('模拟用户');
      await page.goto('/#/pages/profile/bindings');
      const empty = page.locator('.state-card');
      await expect(empty).toContainText('还没有绑定账号');
      const oldHeight = (await empty.boundingBox()).height;
      pending = gate(); delayed = true; fail = true;
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
