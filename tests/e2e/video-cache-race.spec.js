const { test, expect } = require('./support/test');

const ok = data => ({ json: { code: 0, data } });
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

for (const order of ['旧响应先返回', '旧响应后返回', '旧请求失败']) {
  test(`视频保存使在途分类缓存失效：${order}`, async ({ page, apiMock }) => {
    const old = gate(), fresh = gate();
    let allReads = 0, oldRequest;
    let row = { id: '9223372036854775807', title: '保存前标题', url: 'https://www.bilibili.com/video/BV1234567890',
      duration: 100, watchedDuration: 20, episodes: 2, currentEpisode: 1, status: 'in_progress', coverState: 'NONE' };
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'video-cache-fixture'));
    apiMock({
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户', roles: [] }),
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
      'GET /api/b-video/getStatusCount': ok({ in_progress: 1 }),
      'GET /api/b-video/statistics': ok({ studiedSeconds: 20, unstudiedSeconds: 80 }),
      'GET /api/b-video/query': async request => {
        const snapshot = { ...row };
        if (!new URL(request.url()).searchParams.get('status')) {
          const sequence = ++allReads;
          if (sequence === 1) {
            oldRequest = request;
            await old.promise;
            if (order === '旧请求失败') return { json: { code: 1, message: '过期请求失败' } };
          } else await fresh.promise;
        }
        return ok({ items: [snapshot], total: 1 });
      },
      ['PUT /api/b-video/' + row.id]: request => { row = { ...row, ...request.postDataJSON() }; return ok(true); },
    });
    const active = page.locator('.video-page-active');
    const allPage = page.locator('.video-page-content').nth(4);
    try {
      await page.goto('/#/pages/records/video');
      await expect(active.getByRole('button', { name: '编辑视频：保存前标题', exact: true })).toBeVisible();
      await page.locator('.status-tab').nth(4).click();
      await expect.poll(() => allReads).toBe(1);
      await page.locator('.status-tab').nth(1).click();
      await active.getByRole('button', { name: '编辑视频：保存前标题', exact: true }).click();
      await page.getByRole('dialog').locator('[aria-label="标题"] input').fill('保存后的新标题');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(active.locator('.video-title')).toHaveText('保存后的新标题');
      await page.locator('.status-tab').nth(4).click();
      // 旧请求尚未完成，也必须发起保存后的新查询。
      await expect.poll(() => allReads).toBe(2);
      const oldFinished = page.waitForResponse(response => response.request() === oldRequest);
      if (order === '旧响应后返回') {
        fresh.release();
        await expect(active.getByRole('button', { name: '编辑视频：保存后的新标题', exact: true })).toBeVisible();
      }
      old.release();
      await (await oldFinished).finished();
      // 响应处理后等待浏览器绘制，确认旧 finally 没有收起新请求的 loading。
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (order !== '旧响应后返回') {
        await expect(allPage.locator('.page-state')).toHaveAttribute('aria-busy', 'true');
        await expect(allPage.locator('.video-card[role="button"]')).toHaveCount(0);
        fresh.release();
      }
      await expect(active.getByRole('button', { name: '编辑视频：保存后的新标题', exact: true })).toBeVisible();
      await expect(active.getByRole('alert')).toHaveCount(0);
      // 返回已加载分类仍使用新缓存，不能再次显示保存前数据。
      await page.locator('.status-tab').nth(1).click();
      await page.locator('.status-tab').nth(4).click();
      await expect(active.locator('.video-title')).toHaveText('保存后的新标题');
      expect(allReads).toBe(2);
    } finally {
      old.release(); fresh.release();
    }
  });
}
