const { test, expect } = require('@playwright/test');
const { setup, id } = require('./qa-records-fixtures');

const entries = [{ menuId: 'member', path: '/membership', title: '订阅' }];
for (const width of [320, 390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`订阅紧凑表单 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
      await page.emulateMedia({ colorScheme: theme });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = await setup(page);
      state.members[0] = { ...state.members[0], startDate: '2026-01-31', expiryDate: '2026-02-28', note: '模拟备注，折叠后必须保留', color: '#722ed1' };
      await page.route('**/api/quick-nav/candidates', route => route.fulfill({ json: { rscode: '0', data: entries } }));
      await page.route('**/api/menu/preferences', route => route.fulfill({ json: { rscode: '0', data: { menus: entries.map(e => ({ id: e.menuId, title: e.title, children: [] })), hiddenMenuIds: [] } } }));
      await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
      await page.getByRole('button', { name: '订阅', exact: true }).click();
      await page.getByRole('button', { name: '编辑订阅：模拟会员', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑订阅', exact: true });
      const details = dialog.getByRole('button', { name: '颜色与备注', exact: true });
      await expect(details).toHaveAttribute('aria-expanded', 'false');
      await expect(dialog.locator('textarea')).toHaveCount(0);
      await expect.poll(async () => dialog.locator('.modal-content').evaluate(el => {
        const panel = el.closest('.modal-panel');
        return Math.abs(panel.getBoundingClientRect().height - el.getBoundingClientRect().height);
      })).toBeLessThan(2);
      const geometry = await dialog.evaluate(el => ({
        box: el.getBoundingClientRect().toJSON(),
        overflow: el.scrollWidth > el.clientWidth,
        rows: [...el.querySelectorAll('.ui-field-row')].map(row => [...row.children].map(field => field.getBoundingClientRect().toJSON())),
        buttons: [...el.querySelectorAll('[role="button"]')].map(button => button.getBoundingClientRect().toJSON()),
      }));
      expect(geometry.overflow).toBe(false);
      expect(geometry.box.height).toBeLessThan(660);
      for (const [left, right] of geometry.rows) {
        expect(Math.abs(left.y - right.y)).toBeLessThan(1);
        expect(Math.abs(left.width - right.width)).toBeLessThan(1);
      }
      for (const button of geometry.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
      await page.screenshot({ path: `artifacts/member-compact/${width}-${theme}-collapsed.png` });
      await dialog.getByRole('button', { name: '1月', exact: true }).click();
      await expect(dialog.locator('uni-picker[aria-label="到期日期"]')).toContainText('2026-02-28');
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded', 'true');
      await expect(dialog.locator('textarea')).toHaveValue('模拟备注，折叠后必须保留');
      await dialog.locator('textarea').fill('模拟备注修改');
      await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/member-compact/${width}-${theme}-expanded.png` });
      await details.click();
      await expect(dialog.locator('textarea')).toHaveCount(0);
      state.fail = true;
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText('模拟保存失败');
      state.fail = false;
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(state.writes.filter(w => w.path === '/api/membership').at(-1).body).toMatchObject({
        id, note: '模拟备注修改', color: '#722ed1', autoRenew: 1, expiryDate: '2026-02-28', monthlyAmount: 20,
      });
      await page.getByRole('button', { name: '新增订阅', exact: true }).click();
      await expect(page.getByRole('button', { name: '颜色与备注', exact: true })).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('请输入会员名称和到期日期');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      expect(errors).toEqual([]);
    });
  }
}
