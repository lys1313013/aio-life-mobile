const { test, expect } = require('@playwright/test');
const { setup, id } = require('./qa-records-fixtures.js');

for (const width of [390, 768, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`纪念日卡片与菜单 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = await setup(page);
      state.anniversaries = [
        { id, title: '模拟出行', targetDate: '2026-09-20', icon: '✈️', color: 'from-pink-400 to-rose-500', note: '' },
        { id: '2', title: '模拟工作纪念日长标题完整展示', targetDate: '2021-07-25', icon: '💼', color: 'from-gray-700 to-gray-900', note: '' },
        { id: '3', title: '模拟项目', targetDate: '2025-09-23', icon: '🌟', color: 'from-purple-400 to-indigo-500', note: '模拟备注完整保留' },
        { id: '4', title: '模拟生日', targetDate: '2000-01-01', icon: '🎂', color: 'from-cyan-400 to-blue-500', note: '' },
      ];
      await page.goto('/#/pages/records/anniversary');
      await page.reload();
      const cards = page.locator('.event-card');
      await expect(cards).toHaveCount(4);
      await expect(page.getByRole('button', { name: '编辑纪念日', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '删除纪念日', exact: true })).toHaveCount(0);
      const boxes = await cards.evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right };
      }));
      expect(boxes[0].y).toBe(boxes[1].y);
      expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
      expect(boxes.every(b => b.x >= 0 && b.right <= width)).toBe(true);
      await page.screenshot({ path: info.outputPath('anniversary.png') });
      await page.getByRole('button', { name: '更多操作：模拟出行', exact: true }).click();
      await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '新增纪念日', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '更多操作：模拟出行', exact: true }).click();
      await page.getByRole('button', { name: '删除纪念日', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: '删除纪念日', exact: true });
      await expect(confirm).toContainText('确定删除“模拟出行”？');
      const bounds = await confirm.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath('delete-confirmation.png') });
      await confirm.getByRole('button', { name: '取消', exact: true }).click();
      expect(state.writes).toHaveLength(0);
      await page.getByRole('button', { name: '删除纪念日', exact: true }).click();
      state.fail = true;
      await confirm.getByRole('button', { name: '确认', exact: true }).click();
      await expect(confirm).toContainText('模拟保存失败');
      await expect(cards).toHaveCount(4);
      state.fail = false;
      await confirm.getByRole('button', { name: '确认', exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(cards).toHaveCount(3);
      expect(state.writes.at(-1).body).toEqual({ idList: [id] });
      expect(errors).toEqual([]);
    });
  }
}
