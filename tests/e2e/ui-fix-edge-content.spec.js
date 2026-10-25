const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-records-fixtures.js');
const fs = require('node:fs');
const spacing = require('../../src/styles/spacing.json');
const typography = require('../../src/styles/typography.json');
const output = 'artifacts/ui-fixes-2026-10-25/edge-content';
for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`边界内容实际形态 ${width} ${theme}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const state = await setup(page);
    fs.mkdirSync(output, { recursive: true });
    const shot = name => page.screenshot({ path: `${output}/${name}-${width}-${theme}.png` });
    const today = new Date().toLocaleDateString('sv-SE');
    const records = [1, 10, 20, 60, 120].map((minutes, index) => ({ id: String(900 + index), date: today, categoryId: '2', startTime: 480 + index * 150, endTime: 480 + index * 150 + minutes - 1, title: `模拟${minutes}分钟事件长标题用于检查裁切` }));
    await page.route('**/api/timeRecord/query?*', route => route.fulfill({ json: { code: 0, data: records } }));
    await page.goto('/#/pages/time/index');
    const events = page.locator('.timeline-event');
    await expect(events).toHaveCount(5);
    for (let index = 0; index < 5; index++) {
      const event = events.nth(index);
      const height = await event.evaluate(n => n.getBoundingClientRect().height);
      const titleExpected = height >= typography.roles['timeline-small'].lineHeight + spacing.detail * 2;
      await expect(event.locator('.event-title')).toHaveCount(titleExpected ? 1 : 0);
      await expect(event.locator('.event-time')).toHaveCount(height >= spacing.controlMin ? 1 : 0);
      expect(await event.getAttribute('aria-label')).toContain(records[index].title);
      expect(await event.evaluate(n => getComputedStyle(n).overflow)).toBe('hidden');
    }
    await shot('time-short-events');
    state.milestones = [1, 2, 3].map((n) => ({ id: String(100 + n), title: `模拟同月里程碑${n}`, date: `2026-10-${String(n * 5).padStart(2, '0')}`, type: 'life', description: n === 2 ? '模拟较长描述，检查节点与不同高度内容的起始位置保持对齐。'.repeat(4) : '模拟简短描述', tags: '["模拟标签"]' }));
    await page.goto('/#/pages/records/milestones');
    await expect(page.locator('.timeline-entry')).toHaveCount(3);
    await expect(page.locator('.month-title')).toHaveCount(1);
    const geometry = await page.locator('.timeline-entry').evaluateAll(nodes => nodes.map(n => { const entry=n.getBoundingClientRect(),dot=n.querySelector('.timeline-dot').getBoundingClientRect(),card=n.querySelector('.event-card').getBoundingClientRect();return { dotX: dot.x, dotOffset: dot.y-entry.y, cardOffset: card.y-entry.y, cardX:card.x }; }));
    for (const item of geometry) { expect(Math.abs(item.dotX-geometry[0].dotX)).toBeLessThan(1); expect(Math.abs(item.dotOffset-geometry[0].dotOffset)).toBeLessThan(1); expect(Math.abs(item.cardOffset)).toBeLessThan(1); expect(Math.abs(item.cardX-geometry[0].cardX)).toBeLessThan(1); }
    await shot('milestones-same-month');
    state.anniversaries = [{ id: '9223372036854775807', title: '模拟非预设图标纪念日', targetDate: '2026-10-01', icon: '🦊', color: 'from-purple-400 to-indigo-500', note: '模拟备注' }];
    await page.goto('/#/pages/records/anniversary');
    await page.getByRole('button', { name: '更多操作：模拟非预设图标纪念日', exact: true }).click();
    await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
    await page.getByRole('button', { name: '外观设置', exact: true }).click();
    await expect(page.locator('.emoji-choice')).toHaveCount(33);
    await expect(page.getByRole('button', { name: '图标 🦊', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.color-choice')).toHaveCount(6);
    await shot('anniversary-appearance-top');
    await page.locator('.color-choice').last().scrollIntoViewIfNeeded();
    await shot('anniversary-appearance-bottom');
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.writes.at(-1).body.icon).toBe('🦊');
    expect(state.writes.at(-1).body.color).toBe('from-purple-400 to-indigo-500');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
