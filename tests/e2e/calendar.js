const { expect } = require('@playwright/test');

// 通过用户可操作的年月面板选日期，不写 DOM 值或触发内部组件事件。
async function selectCalendarDate(page, trigger, value) {
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: /日历$/ });
  await calendar.getByRole('button', { name: '选择年份', exact: true }).click();
  const target = Number(value.slice(0, 4));
  for (let pageIndex = 0; pageIndex < 750; pageIndex++) {
    const year = calendar.getByRole('button', { name: target + '年', exact: true });
    if (await year.count()) { await year.click(); break; }
    const first = Number((await calendar.locator('.calendar-option').first().getAttribute('aria-label')).replace('年', ''));
    await calendar.getByRole('button', { name: target < first ? '上一组年份' : '下一组年份', exact: true }).click();
  }
  await calendar.getByRole('button', { name: Number(value.slice(5, 7)) + '月', exact: true }).click();
  await calendar.getByRole('button', { name: value, exact: true }).click();
  await expect(calendar).toHaveCount(0);
}
module.exports = { selectCalendarDate };
