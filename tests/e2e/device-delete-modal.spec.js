const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

test('设备删除只在编辑弹窗内出现，确认失败可重试，成功后关闭弹窗并更新列表', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await setup(page);
  await page.route('**/api/device/query?*', route => route.fulfill({ json: {
    rscode: '0', data: { items: [{ id: '9223372036854775807', name: '模拟设备', type: '81', status: '1', purchasePrice: 100 }], total: 1 },
  } }));
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/device/9223372036854775807', async route => {
    expect(route.request().method()).toBe('DELETE');
    calls++;
    if (calls === 1) return route.fulfill({ json: { rscode: '1', result: '模拟删除失败' } });
    await pending;
    await route.fulfill({ json: { rscode: '0', data: true } });
  });
  await page.goto('/#/pages/goods/devices');
  await expect(page.getByText('模拟设备', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除设备', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '新增设备', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑设备', exact: true });
  await expect(editor.getByRole('button', { name: '删除设备', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '编辑设备', exact: true }).click();
  const remove = editor.getByRole('button', { name: '删除设备', exact: true });
  await remove.click();
  const confirmation = page.getByRole('dialog', { name: '删除设备', exact: true });
  await expect(confirmation.getByText('确定删除设备「模拟设备」？', { exact: true })).toBeVisible();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(calls).toBe(0);
  await remove.click();
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toHaveText('模拟删除失败');
  await expect(editor).toBeVisible();
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  release();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText('模拟设备', { exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
});
