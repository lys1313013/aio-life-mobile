const { expect } = require('@playwright/test');

// AdaptiveModal 的关闭手势是点击遮罩；不依赖可选的标题栏关闭按钮。
async function dismissModal(page) {
  const dialogs = page.getByRole('dialog');
  await expect(dialogs.last()).toBeVisible();
  // 部分编辑器替换详情弹窗，取消后会恢复详情，弹窗总数不一定减少。
  const label = await dialogs.last().getAttribute('aria-label');
  const sameDialogs = page.getByRole('dialog', { name: label, exact: true });
  const count = await sameDialogs.count();
  if ((await dialogs.last().getAttribute('class') || '').split(/\s+/).includes('confirm-panel')) {
    await dialogs.last().getByRole('button', { name: '取消', exact: true }).click();
  } else {
    await page.locator('.modal-mask').last().click({ position: { x: 2, y: 2 } });
  }
  await expect(sameDialogs).toHaveCount(count - 1);
}

module.exports = { dismissModal };
