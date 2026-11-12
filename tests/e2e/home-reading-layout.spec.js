const { test, expect } = require('./support/test');
const spacing = require('../../src/styles/spacing.json');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
function cover(title, color, width = 100) {
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="150"><rect width="100%" height="100%" fill="${color}"/><path d="M8 0v150" stroke="#000" opacity=".15"/><rect x="16" y="30" width="70%" height="55" fill="#fff" opacity=".85"/><text x="22" y="55" font-size="10" fill="#333">${title}</text><text x="22" y="72" font-size="7" fill="#666">SIMULATED BOOK</text></svg>`);
}
function rows() {
  return ['模拟阅读', '模拟哲学', '模拟思考', '模拟故事', '模拟文集'].map((title, index) => ({
    id: String(index + 1), title, status: index < 2 ? 'in_progress' : 'not_started',
    coverImgUrl: cover(title, ['#a53648', '#e8bd4e', '#ddd9ce', '#8bc9ca', '#ecd3a0'][index], index === 1 ? 75 : 100),
  }));
}
async function geometry(card) {
  return card.evaluate(el => {
    const box = el.getBoundingClientRect();
    return { height: box.height, books: [...el.querySelectorAll('.reading-book')].map(book => {
      const rect = book.getBoundingClientRect();
      return { top: rect.top - box.top, bottom: rect.bottom - box.top, width: rect.width, height: rect.height };
    }) };
  });
}
for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
  test(`阅读双排封面完整展示及刷新稳定 ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'reading-layout-fixture'));
    const state = { pending: gate(), rows: rows(), fail: false };
    const data = {
      '/api/user/info': { id: 'fixture-user', nickname: '模拟用户' },
      '/api/home/cards': [{ cardKey: 'section.reading', title: '阅读', group: 'section', isEnabled: 1, sortOrder: 0 }],
      '/api/menu/visuals': { menus: [], cards: {} },
      '/api/auth/secondary-lock/menus': [], '/api/menu/all': [],
      '/api/quick-nav/candidates': [{ path: '/my-hub/read-record' }],
      '/api/quick-nav/my': [], '/api/dashboard/tasks': [], '/api/thought/dashboard': [], '/api/taskDetails/watched': [],
    };
    apiMock({
      ...Object.fromEntries(Object.entries(data).map(([path, value]) => ['GET ' + path, { json: { code: 0, message: null, data: value } }])),
      'GET /api/read-record/page': async () => {
        await state.pending.promise;
        return { json: state.fail ? { code: 1, message: '模拟刷新失败' } : { code: 0, message: null, data: { items: state.rows, total: state.rows.length } } };
      },
      'GET /api/read-record/5': { json: { code: 0, message: null, data: rows()[4] } },
    });
    const card = page.locator('[aria-label="阅读首页卡片"]');
    try {
      await page.goto('/#/pages/home/index');
      await expect(card.locator('.reading-placeholder')).toHaveCount(3);
      await card.screenshot({ path: info.outputPath('loading.png') });
      state.pending.release();
      await expect(card.locator('.reading-book')).toHaveCount(5);
      await expect(card.locator('.reading-placeholder, .image-placeholder')).toHaveCount(0);
      const loaded = await geometry(card);
      expect(loaded.height).toBeLessThanOrEqual(width >= 1024 ? 280 : width >= 640 ? 250 : 240);
      for (const book of loaded.books) {
        expect(book.bottom).toBeLessThanOrEqual(loaded.height - spacing.card);
        expect(book.width).toBeGreaterThanOrEqual(spacing.controlMin);
        expect(book.height).toBeGreaterThanOrEqual(spacing.controlMin);
      }
      expect(loaded.books[0].height).toBe(loaded.books[4].height);
      expect(loaded.books[1].width).toBeLessThan(loaded.books[0].width);
      await card.screenshot({ path: info.outputPath('two-shelves.png') });

      state.pending = gate();
      await card.getByRole('button', { name: '刷新阅读', exact: true }).click();
      await expect(card).toHaveAttribute('aria-busy', 'true');
      expect(await geometry(card)).toEqual(loaded);
      state.fail = true; state.pending.release();
      await expect(card).toHaveAttribute('aria-busy', 'false');
      expect(await geometry(card)).toEqual(loaded);
      state.fail = false;
      await card.getByRole('button', { name: '重试阅读：模拟刷新失败', exact: true }).click();
      await expect(card).toHaveAttribute('aria-busy', 'false');
      await expect(card.getByRole('button', { name: '重试阅读：模拟刷新失败', exact: true })).toHaveCount(0);
      expect(await geometry(card)).toEqual(loaded);

      // 第二排最后一本必须可直接点击，不能被卡片 overflow 裁切。
      await card.getByRole('button', { name: '编辑模拟文集', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[aria-label="名称"] input')).toHaveValue('模拟文集');
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      state.rows = [rows()[0]];
      await card.getByRole('button', { name: '刷新阅读', exact: true }).click();
      await expect(card.locator('.reading-book')).toHaveCount(1);
      expect((await geometry(card)).books[0].height).toBe(99);
      await card.screenshot({ path: info.outputPath('single-shelf.png') });
      state.rows = [];
      await card.getByRole('button', { name: '刷新阅读', exact: true }).click();
      await expect(card).toHaveCount(0);
    } finally { state.pending.release(); }
  });
}
