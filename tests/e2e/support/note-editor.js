const { expect } = require('./test');

// 原有页面巡检继续覆盖笔记新增/编辑和删除确认，按整页路由验收。
async function inspectNoteEditor(page, shot) {
  await expect(page).toHaveURL(/records\/note-edit/);
  await expect(page.getByRole('textbox', { name: '标题', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '内容', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await shot('笔记整页编辑');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await expect(page.getByRole('group', { name: '笔记更多操作', exact: true })).toBeVisible();
  if (await page.getByRole('button', { name: '删除笔记', exact: true }).count()) {
    await page.getByRole('button', { name: '删除笔记', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '删除笔记', exact: true });
    await expect(confirmation).toBeVisible();
    await shot('笔记删除确认');
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  }
  await page.locator('.note-menu-shade').click({ position: { x: 1, y: 1 } });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page).not.toHaveURL(/records\/note-edit/);
}
module.exports = { inspectNoteEditor };
