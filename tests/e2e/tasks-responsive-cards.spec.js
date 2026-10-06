const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const fs = require('fs');
const output = 'artifacts/tasks-responsive-cards';
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`待办真实形态卡片 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await setup(page);
    const rows = [
      { id: '101', columnId: '8', content: '整理季度工作复盘材料并准备团队分享与下一季度行动计划', detail: '汇总关键成果、项目风险与下一步安排，补充资料链接并记录后续跟进事项。', unCompletedCount: 3, dueDate: '2026-10-15 18:00:00' },
      { id: '102', columnId: '8', content: '预约年度体检', detail: '确认时间与检查项目。', unCompletedCount: 0, dueDate: '2026-10-20 10:00:00' },
      { id: '103', columnId: '8', content: '整理读书笔记与本周练习计划', detail: '将新学到的方法整理成清单，周末回顾实践进展。', unCompletedCount: 2 },
    ];
    await page.route('**/api/tasks?*', route => route.fulfill({ json: { code: 0, data: { items: rows, total: rows.length } } }));
    await page.route('**/api/taskDetails?*', route => route.fulfill({ json: { code: 0, data: [
      { id: '201', taskId: '101', content: '整理完成的项目记录并补充关键指标与复盘结论', priority: 1, isCompleted: 0, isStarred: 1, startTime: '2026-10-10 09:00:00', endTime: '2026-10-15 18:00:00' },
      { id: '202', taskId: '101', content: '确认团队分享时间', priority: 20, isCompleted: 1, isStarred: 0 },
      { id: '203', taskId: '101', content: '准备分享材料和下一季度行动清单', priority: 10, isCompleted: 0, isStarred: 0 },
    ] } }));
    await page.goto('/#/pages/tasks/todo');
    const cards = page.locator('[aria-label^="任务详情："]');
    await expect(cards).toHaveCount(3);
    const boxes = await cards.evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width })));
    if (width === 390) expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    else { expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThan(2); expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width); }
    if (width === 768) expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    if (width === 1440) expect(Math.abs(boxes[2].y - boxes[0].y)).toBeLessThan(2);
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: `${output}/todo-${width}-${theme}-page.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cards.first().press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('确认团队分享时间', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${output}/todo-${width}-${theme}-modal.png` });
    await page.getByRole('button', { name: '新增明细', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/todo-${width}-${theme}-modal-footer.png` });
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const search = page.locator('input[aria-label="搜索任务"]');
    await search.fill('体检');
    await expect(cards).toHaveCount(1);
    await search.fill('');
    await expect(cards).toHaveCount(3);
  });
}
