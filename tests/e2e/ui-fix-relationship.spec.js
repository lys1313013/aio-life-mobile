const { test, expect } = require('./support/test');
const { setup } = require('./qa-domains-fixtures');

const person = {
  id: '9223372036854775801', name: '模拟人物甲', category: '社会',
  description: '一起学习的朋友', tags: '学习,运动', birthday: '1994-03-12',
  phone: '13800000000', email: 'example@example.com', school: '模拟大学',
  socialLinks: 'https://example.com/profile', notes: '用于界面验证的模拟备注',
  relationships: [{
    id: '9223372036854775803', target: { id: '9223372036854775802', name: '模拟人物乙' },
    relationType: '朋友', direction: '双向', description: '模拟关系说明', tags: '同学',
  }],
};

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`relationship detail remains readable at ${width} with app ${theme} opposite system`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await setup(page);
    await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), theme);
    let resolveDetail;
    const detailRequested = new Promise(resolve => { resolveDetail = resolve; });
    let releaseDetail;
    const detailGate = new Promise(resolve => { releaseDetail = resolve; });
    await page.route('**/api/relationships/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/graph')) {
        return route.fulfill({ json: { code: 0, data: { nodes: [
          { id: person.id, name: person.name, category: person.category },
          { id: '9223372036854775802', name: '模拟人物乙', category: '社会' },
        ], edges: [{ source: person.id, target: '9223372036854775802', relationType: '朋友', direction: '双向' }] } } });
      }
      expect(path).toBe(`/api/relationships/persons/${person.id}`);
      expect(route.request().method()).toBe('GET');
      resolveDetail();
      await detailGate;
      await route.fulfill({ json: { code: 0, data: person } });
    });
    await page.goto('/#/pages/relationship/index');
    const node = page.getByRole('button', { name: person.name, exact: true });
    const nodeText = node.locator('.node-name');
    const beforeColor = await nodeText.evaluate(el => getComputedStyle(el).color);
    await node.click();
    await detailRequested;
    await expect(node).toBeDisabled();
    expect(await nodeText.evaluate(el => getComputedStyle(el).color)).toBe(beforeColor);
    releaseDetail();
    const dialog = page.getByRole('dialog', { name: person.name, exact: true });
    await expect(dialog).toBeVisible();
    for (const label of ['简介', '标签', '生日', '电话', '邮箱', '学校', '社交链接', '备注']) {
      await expect(dialog.locator('.detail-label').filter({ hasText: label })).toHaveCount(1);
    }
    await expect(dialog.locator('.edge-title')).toHaveText('模拟人物乙 · 朋友 · 双向');
    const contrasts = await dialog.evaluate(el => {
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = channels => channels.map(value => {
        const n = value / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const surface = el.querySelector('.modal-surface') || el;
      const background = luminance(rgb(getComputedStyle(surface).backgroundColor));
      return Array.from(el.querySelectorAll('.title, .detail, .edge-title, .detail-label')).map(node => {
        const foreground = luminance(rgb(getComputedStyle(node).color));
        return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
      });
    });
    expect(contrasts.length).toBeGreaterThan(10);
    expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/ui-fixes-2026-10-25/screenshots/relationship-detail-${width}-${theme}.png` });
  });
}
