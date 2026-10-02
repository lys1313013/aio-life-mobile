import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/navigation-layout.ts', import.meta.url), 'utf8');
const { navigationLayout } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const spacing = JSON.parse(await readFile(new URL('../src/styles/spacing.json', import.meta.url), 'utf8'));

test('不同状态栏与胶囊尺寸下，导航避让系统区域且保留触控高度', () => {
  for (const [width, status, top, capsuleWidth] of [[320, 20, 26, 87], [390, 54, 60, 87], [430, 59, 65, 101], [768, 24, 32, 87]]) {
    const capsule = { top, height: 32, width: capsuleWidth, left: width - capsuleWidth - 7, right: width - 7 };
    const layout = navigationLayout({ windowWidth: width, statusBarHeight: status }, capsule, spacing);
    assert.equal(layout.statusBarHeight, status);
    assert.ok(layout.navigationHeight >= spacing.controlMin);
    assert.equal(width - layout.rightInset, capsule.left - spacing.inline);
    assert.ok(width - layout.rightInset - spacing.page >= 168, '日期与前后切换能完整显示');
    assert.equal(status + layout.navigationHeight / 2, capsule.top + capsule.height / 2);
  }
});
test('胶囊尺寸尚不可用时保留避让；窗口变化后采用新位置', () => {
  const info = { windowWidth: 390, statusBarHeight: 54 };
  for (const capsule of [{}, { top: 0, height: 0, width: 0, left: 0, right: 0 }]) {
    const layout = navigationLayout(info, capsule, spacing);
    assert.equal(layout.navigationHeight, 48);
    assert.equal(layout.rightInset, 96 + spacing.inline);
  }
  assert.equal(navigationLayout(info, null, spacing).rightInset, spacing.page);
  assert.equal(navigationLayout({ windowWidth: 768, statusBarHeight: 24 }, { top: 32, height: 32, width: 87, left: 660, right: 747 }, spacing).rightInset, 108 + spacing.inline);
});
