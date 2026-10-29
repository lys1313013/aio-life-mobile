const { test, expect } = require('./support/test');

test.use({ hasTouch: true });

// 只模拟银行卡及登录所需接口，其他请求保留真实失败，避免掩盖依赖问题。
async function prepare(page, baseURL, cards) {
  await page.addInitScript(() => {
    localStorage.setItem('aio-life-mobile.access-token.v1', 'card-type-fixture');
    localStorage.setItem('bank-card-view-mode', 'stack');
  });
  for (const [path, data] of Object.entries({
    '/user/info': { id: '1', nickname: '模拟用户', roles: ['admin'] },
    '/auth/secondary-lock/menus': [],
    '/bank-cards': cards,
    '/bank-cards/banks': [{ id: '9', name: '模拟银行' }],
    '/bank-cards/tags': [],
  })) {
    await page.route(`${baseURL}/api${path}`, route => route.fulfill({ json: { code: 0, data } }));
  }
  await page.goto('/#/pages/finance/cards');
}

const card = { bankId: '9', bankName: '模拟银行', status: 'normal', tags: [], coverFileIds: [] };

test('切换类型取消旧卡号读取，旧响应不能覆盖新卡的加载或恢复明文', async ({ page, baseURL }) => {
  let releaseDebit, releaseCredit;
  const debitGate = new Promise(resolve => { releaseDebit = resolve; });
  const creditGate = new Promise(resolve => { releaseCredit = resolve; });
  await page.route(`${baseURL}/api/bank-cards/88/number`, async route => {
    await debitGate;
    await route.fulfill({ json: { code: 0, data: '622200001234' } });
  });
  await page.route(`${baseURL}/api/bank-cards/89/number`, async route => {
    await creditGate;
    await route.fulfill({ json: { code: 0, data: '433300005678' } });
  });
  await prepare(page, baseURL, [
    { ...card, id: '88', cardType: 'debit', cardNoLast4: '1234', sortOrder: 1 },
    { ...card, id: '89', cardType: 'credit', cardNoLast4: '5678', sortOrder: 2 },
  ]);
  await expect(page.locator('.card')).toHaveCount(1);
  const debit = page.getByRole('button', { name: '储蓄卡', exact: true });
  const credit = page.getByRole('button', { name: '信用卡', exact: true });
  await expect(debit).toHaveAttribute('aria-pressed', 'true');
  await expect(debit).toHaveText('储蓄卡 1');
  await expect(credit).toHaveText('信用卡 1');
  await expect(page.locator('.header-count, .face-type, .face-tail, .number')).toHaveCount(0);
  async function readNumber() {
    await page.locator('.card-face').click({ position: { x: 40, y: 24 } });
    await page.getByRole('button', { name: '银行卡更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '查看卡号', exact: true }).click();
  }
  const debitRequested = page.waitForRequest(`${baseURL}/api/bank-cards/88/number`);
  await readNumber();
  await debitRequested;
  await credit.click();
  await expect(page.locator('.card-stack-expanded')).toHaveCount(0);
  const creditRequested = page.waitForRequest(`${baseURL}/api/bank-cards/89/number`);
  await readNumber();
  await creditRequested;
  const oldResponse = page.waitForResponse(`${baseURL}/api/bank-cards/88/number`);
  releaseDebit();
  await oldResponse;
  await expect(page.getByRole('button', { name: '银行卡更多操作', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '银行卡卡号', exact: true })).toHaveCount(0);
  releaseCredit();
  const numberDialog = page.getByRole('dialog', { name: '银行卡卡号', exact: true });
  await expect(numberDialog.locator('.card-number-detail')).toHaveText('4333 0000 5678');
  await numberDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await debit.click();
  await expect(page.locator('.card-browser-moving')).toHaveCount(0);
  await page.locator('.card-face').click({ position: { x: 40, y: 24 } });
  await expect(numberDialog).toHaveCount(0);
  await expect(page.locator('.card').getByText(/6222|4333|1234|5678/)).toHaveCount(0);
});

test('只有信用卡时直接展示，空储蓄卡可切换且新增沿用当前类型', async ({ page, baseURL }) => {
  await prepare(page, baseURL, [{ ...card, id: '89', cardType: 'credit', cardNoLast4: '5678', sortOrder: 1 }]);
  await expect(page.getByRole('button', { name: '信用卡', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('button', { name: '储蓄卡', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.getByText('暂无储蓄卡', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增银行卡', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '银行卡', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.locator('[aria-label="类型"]')).toContainText('储蓄卡');
});

for (const input of ['mouse', 'touch']) for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`不同高度卡包双向滑动及取消不裁切底部 ${input} ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => {
      localStorage.setItem('aio-life-mobile.access-token.v1', 'card-swipe-fixture');
      localStorage.setItem('bank-card-view-mode', 'stack');
      localStorage.setItem('bank-card-stack-height-debit', JSON.stringify({ type: 'number', data: 60 }));
      localStorage.setItem('bank-card-stack-height-credit', JSON.stringify({ type: 'number', data: 100 }));
    });
    const cards = ['debit', 'credit'].flatMap((cardType, typeIndex) =>
      Array.from({ length: typeIndex ? 5 : 2 }, (_, i) => ({
        ...card, id: `${typeIndex + 1}${i}`, cardType, sortOrder: i,
        coverFileIds: [`swipe-cover-${cardType}`],
        cardName: `模拟${cardType}卡 ${i + 1}`, coverColor: typeIndex ? '#38605c' : '#334766',
      })),
    );
    apiMock({ ...Object.fromEntries(Object.entries({
      '/user/info': { id: '1', nickname: '模拟用户', roles: ['admin'] },
      '/auth/secondary-lock/menus': [],
      '/bank-cards': cards,
      '/bank-cards/banks': [{ id: '9', name: '模拟银行' }],
      '/bank-cards/tags': [],
    }).map(([path, data]) => [`GET /api${path}`, { json: { code: 0, message: null, data } }])),
      ...Object.fromEntries(['debit', 'credit'].map(type => [`GET /api/file/preview/swipe-cover-${type}`, {
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="404"><rect width="640" height="404" rx="24" fill="${type === 'debit' ? '#334766' : '#38605c'}"/><text x="36" y="60" fill="white" font-size="32">DEMO ${type}</text><path d="M24 360 H616" stroke="white" stroke-width="8"/></svg>`,
      }])),
    });
    await page.goto('/#/pages/finance/cards');
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.locator('.card-face[aria-busy="true"]')).toHaveCount(0);
    const cdp = input === 'touch' ? await page.context().newCDPSession(page) : null;
    async function press(x, y) {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      else { await page.mouse.move(x, y); await page.mouse.down(); }
    }
    async function move(x, y) {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
      else await page.mouse.move(x, y, { steps: 8 });
    }
    async function release() {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    }

    for (const [from, to, direction] of [['debit', 'credit', -1], ['credit', 'debit', 1]]) {
      const viewport = page.locator('.card-browser-viewport');
      const box = await viewport.boundingBox();
      const x = box.x + box.width * (direction < 0 ? 0.8 : 0.2), y = box.y + 24;
      await press(x, y);
      await move(x + direction * box.width * 0.5, y);
      await expect(page.locator('.card-layer')).toHaveCount(2);
      // 实际卡面边界必须落在裁切容器内；同时命中底部，避免只测布局却漏掉绘制裁切。
      const bottoms = await viewport.evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return [...node.querySelectorAll('.card-layer')].map(layer => {
          const faces = layer.querySelectorAll('.card-face');
          const face = faces[faces.length - 1];
          const rect = face.getBoundingClientRect();
          const left = Math.max(bounds.left, rect.left), right = Math.min(bounds.right, rect.right);
          const hit = document.elementFromPoint((left + right) / 2, rect.bottom - 8);
          return { fits: rect.bottom <= bounds.bottom + 1, visibleWidth: right - left, hit: face.contains(hit) };
        });
      });
      expect(bottoms).toHaveLength(2);
      for (const bottom of bottoms) {
        expect(bottom.fits).toBe(true);
        expect(bottom.visibleWidth).toBeGreaterThan(0);
        expect(bottom.hit).toBe(true);
      }
      await page.screenshot({ path: `artifacts/bank-card-stack/${input}-${width}-${theme}-${from}-swipe.png` });
      // 先回到起点取消，再完成同方向切换，覆盖回弹和双向高度恢复。
      await move(x, y);
      await release();
      await expect(page.locator('.card-layer')).toHaveCount(1);
      await expect(page.locator(`#card-layer-${from}`)).toBeVisible();
      await press(x, y);
      await move(x + direction * box.width * 0.6, y);
      await release();
      await expect(page.locator('.card-layer')).toHaveCount(1);
      await expect(page.locator(`#card-layer-${to}`)).toBeVisible();
      const finalBox = await viewport.boundingBox();
      const layerBox = await page.locator(`#card-layer-${to}`).boundingBox();
      expect(finalBox.height).toBeCloseTo(layerBox.height, 0);
    }
  });
}
