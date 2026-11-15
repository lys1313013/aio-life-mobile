const { test, expect } = require('./support/test');
const { stableBox } = require('./support/geometry');
const { waitForMotion } = require('./support/motion');
const spacing = require('../../src/styles/spacing.json');

const day = '2026-11-15';
const recordId = '9223372036854775807';
const typeId = '9223372036854775806';
const response = data => ({ json: { code: 0, message: null, data } });

async function expectInputVisible(dialog, input) {
  await expect.poll(async () => {
    const viewport = await dialog.locator('.modal-scroll').boundingBox();
    const field = await input.boundingBox();
    return field.y >= viewport.y && field.y + field.height <= viewport.y + viewport.height;
  }, { message: '当前输入项应完整显示在弹窗滚动区内' }).toBe(true);
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await expect(save).toBeInViewport();
  expect(await save.evaluate(node => {
    const box = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`时迹输入避让与恢复 ${width} ${theme}`, async ({ page, apiMock }) => {
    const originalHeight = 900;
    await page.setViewportSize({ width, height: originalHeight });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(theme => {
      localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'keyboard-fixture' }));
      localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
    }, theme);
    const record = { id: recordId, date: day, categoryId: '2', startMinute: 600, endMinute: 659,
      title: '模拟运动', description: '模拟备注',
      exercises: Array.from({ length: 20 }, (_, index) => ({ id: String(100 + index), exerciseTypeId: typeId, exerciseCount: 10 })) };
    apiMock({
      'GET /api/auth/secondary-lock/menus': response([]),
      'GET /api/timeTrackerCategory/list': response([{ id: '2', name: '运动', color: '#3fb27f' }]),
      [`GET /api/timeRecord/${recordId}`]: response(record),
      'GET /api/timeRecord/query': response([record]),
      'GET /api/timeRecord/relateTypes': response([]),
      'GET /api/userDictType/getByDictType': response({ dictDetailList: [{ id: typeId, dictLabel: '俯卧撑' }] }),
    });
    await page.goto(`/#/pages/time/edit?id=${recordId}&date=${day}`);
    const editor = page.getByRole('dialog', { name: '编辑时迹', exact: true });
    const notes = editor.locator('.compact-description textarea');
    await expect(notes).toHaveValue('模拟备注');
    await waitForMotion(page);
    const original = await stableBox(editor);
    await page.screenshot({ path: `artifacts/time-keyboard/${width}-${theme}-normal.png` });
    await notes.fill('模拟输入中的备注，键盘收起后保留。');
    // 缩小可见视口模拟软键盘；微信原生上推由组件配置及真机另行验证。
    const keyboardViewport = 460;
    await page.setViewportSize({ width, height: keyboardViewport });
    await expectInputVisible(editor, notes);
    const reduced = await stableBox(editor);
    expect(reduced.y).toBeGreaterThanOrEqual(spacing.overlayBlock + spacing.modal);
    expect(reduced.y + reduced.height).toBeLessThanOrEqual(keyboardViewport - spacing.overlayBlock - spacing.modal + 1);
    await page.screenshot({ path: `artifacts/time-keyboard/${width}-${theme}-typing.png` });
    const title = editor.locator('.compact-title input');
    await title.fill('模拟标题修改');
    await expectInputVisible(editor, title);
    await page.setViewportSize({ width, height: originalHeight });
    await expect.poll(async () => Math.abs((await editor.boundingBox()).height - original.height)).toBeLessThan(1);
    await expect(notes).toHaveValue('模拟输入中的备注，键盘收起后保留。');
    await expect(title).toHaveValue('模拟标题修改');
    await editor.getByRole('button', { name: '俯卧撑第1组，10次，编辑', exact: true }).click();
    const exercise = page.getByRole('dialog', { name: '编辑运动组', exact: true });
    const count = exercise.locator('.exercise-edit-count input');
    await count.fill('18');
    await page.setViewportSize({ width, height: keyboardViewport });
    await expectInputVisible(exercise, count);
    await exercise.getByRole('button', { name: '保存', exact: true }).click();
    await expect(exercise).toHaveCount(0);
    await page.setViewportSize({ width, height: originalHeight });
    await expect(editor.getByRole('button', { name: '俯卧撑第1组，18次，编辑', exact: true })).toBeVisible();
    await expect(notes).toHaveValue('模拟输入中的备注，键盘收起后保留。');
  });
}
