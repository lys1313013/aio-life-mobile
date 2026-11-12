const { test, expect } = require('./support/test');

const day = '2026-10-15';
const categories = [
  { id: '1', name: '学习', color: '#5b8ff9' },
  { id: '2', name: '运动', color: '#3fb27f' },
  { id: '3', name: '阅读', color: '#d4942b', relateType: 1 },
];
const response = data => ({ json: { code: 0, message: null, data } });

// 按住真实鼠标检查平台 hover 状态；释放才触发按钮业务动作。
async function press(page, button, screenshot) {
  await button.scrollIntoViewIfNeeded();
  const paint = () => button.evaluate(node => {
    const style = getComputedStyle(node), after = getComputedStyle(node, '::after');
    return { background: style.backgroundColor, border: style.borderWidth === '0px' ? null : style.borderColor,
      opacity: style.opacity, transform: style.transform, shadow: style.boxShadow, after: after.borderWidth };
  });
  const idle = await paint();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    // 等待浏览器绘制按下状态，覆盖平台默认 hover-start-time，避免瞬时负向断言。
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(button).not.toHaveClass(/button-hover|[\w-]+-pressed/);
    expect(await paint()).toEqual(idle);
    expect(idle.after).toBe('0px');
    if (screenshot) await page.screenshot({ path: screenshot });
  } finally {
    await page.mouse.up();
  }
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`时迹弹窗点击与禁用配色 ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date(`${day}T18:00:00`));
    // 特意与应用主题相反，暴露平台 prefers-color-scheme 默认样式泄漏。
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
    await page.addInitScript(theme => {
      localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({ type: 'string', data: 'theme-fixture' }));
      localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({ type: 'string', data: theme }));
    }, theme);
    apiMock({
      'GET /api/auth/secondary-lock/menus': response([]),
      'GET /api/timeTrackerCategory/list': response(categories),
      'GET /api/timeRecord/recommendNext': response({ records: [], recommend: { date: day, categoryId: '1', startMinute: 600, endMinute: 659 } }),
      'GET /api/timeRecord/relateTypes': response([{ label: '阅读', value: 1 }]),
      'GET /api/userDictType/getByDictType': response({ dictDetailList: [{ id: '9223372036854775806', dictLabel: '俯卧撑' }] }),
      'GET /api/read-record/page': response({ items: [{ id: '9223372036854775805', title: '模拟阅读', status: 'in_progress' }], total: 1 }),
      'GET /api/read-record/9223372036854775805': response({ id: '9223372036854775805', title: '模拟阅读', status: 'in_progress' }),
      'GET /api/timeRecord/9223372036854775807': response({ id: '9223372036854775807', date: day, categoryId: '2', startMinute: 600, endMinute: 659, exercises: [{ exerciseTypeId: '9223372036854775806', exerciseCount: 12 }] }),
      'GET /api/timeRecord/query': response([
        { id: '9223372036854775807', date: day, categoryId: '2', startMinute: 600, endMinute: 659 },
        { id: '9223372036854775804', date: day, categoryId: '1', startMinute: 660, endMinute: 719 },
      ]),
    });
    await page.goto(`/#/pages/time/edit?date=${day}`);
    const editor = page.getByRole('dialog', { name: '记录时间', exact: true });
    await expect(editor.locator('.compact-title')).toBeVisible();
    const prefix = `artifacts/time-editor-theme/${width}-${theme}`;
    for (const selector of ['.compact-title input', '.compact-description textarea']) {
      const input = editor.locator(selector);
      await input.fill('模拟内容：检查夜间输入、聚焦及长文本换行。');
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
    await press(page, editor.getByRole('button', { name: '记录日期', exact: true }), `${prefix}-date-pressed.png`);
    const calendar = page.getByRole('dialog', { name: '记录日期日历', exact: true });
    await expect(calendar).toBeVisible();
    await press(page, calendar.getByRole('button', { name: day, exact: true }));
    await expect(calendar).toHaveCount(0);
    await press(page, editor.getByRole('button', { name: '结束时间', exact: true }));
    const time = page.getByRole('dialog', { name: '选择结束时间', exact: true });
    await expect(time).toBeVisible();
    await press(page, time.getByRole('button', { name: '确定', exact: true }), `${prefix}-time-pressed.png`);
    await expect(time).toHaveCount(0);
    await press(page, editor.getByRole('button', { name: '选择分类', exact: true }));
    const category = page.getByRole('dialog', { name: '选择分类', exact: true });
    await expect(category).toBeVisible();
    await press(page, category.getByRole('button', { name: '运动', exact: true }), `${prefix}-category-pressed.png`);
    await press(page, editor.getByRole('button', { name: '添加运动', exact: true }));
    await press(page, page.getByRole('dialog', { name: '选择运动', exact: true }).getByRole('button', { name: '俯卧撑', exact: true }));
    const exercise = page.getByRole('dialog', { name: '添加一组', exact: true });
    await exercise.locator('[aria-label="本组次数"] input').fill('12');
    await press(page, exercise.getByRole('button', { name: '保存', exact: true }));
    await expect(exercise).toHaveCount(0);
    await press(page, editor.getByRole('button', { name: '俯卧撑第1组，12次，编辑', exact: true }), `${prefix}-exercise-pressed.png`);
    const editSet = page.getByRole('dialog', { name: '编辑运动组', exact: true });
    await expect(editSet).toBeVisible();
    await press(page, editSet.getByRole('button', { name: '保存', exact: true }));
    await expect(editSet).toHaveCount(0);
    await page.screenshot({ path: `${prefix}-editor.png` });
    await press(page, editor.getByRole('button', { name: '选择分类', exact: true }));
    await press(page, category.getByRole('button', { name: '阅读', exact: true }));
    await press(page, editor.getByRole('button', { name: '选择关联阅读', exact: true }), `${prefix}-related-pressed.png`);
    const related = page.getByRole('dialog', { name: '选择关联记录', exact: true });
    await expect(related.getByRole('button', { name: '模拟阅读，在读', exact: true })).toBeVisible();
    await press(page, related.getByRole('button', { name: '搜索关联记录', exact: true }));
    await related.getByRole('button', { name: '模拟阅读，在读', exact: true }).click();
    await expect(related).toHaveCount(0);
    await press(page, editor.getByRole('button', { name: '清除关联记录', exact: true }));
    await expect(editor.getByRole('button', { name: '选择关联阅读', exact: true })).toBeVisible();

    await page.goto(`/#/pages/time/edit?id=9223372036854775807&date=${day}`);
    // 同一个 uni-app hash 路由切换参数不重新执行 onLoad；重新启动深链入口。
    await page.reload();
    const existing = page.getByRole('dialog', { name: '编辑时迹', exact: true });
    const date = existing.getByRole('button', { name: '记录日期', exact: true });
    // uni-button 是自定义元素，禁用契约通过 disabled 属性及实际点击行为验证。
    await expect(date).toHaveAttribute('disabled', 'true');
    await expect(date).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await date.click();
    await expect(calendar).toHaveCount(0);
    await press(page, existing.getByRole('button', { name: '结束时间', exact: true }));
    await expect(time.getByRole('button', { name: '结束时间设为此刻', exact: true })).toHaveAttribute('disabled', 'true');
    await expect(time.getByRole('button', { name: '结束时间设为此刻', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await time.getByRole('button', { name: '结束时间设为此刻', exact: true }).click();
    await expect(time).toBeVisible();
    await expect(time.locator('.time-end-number-selected')).toHaveText(['10', '59']);
    await press(page, time.getByRole('button', { name: '取消', exact: true }), `${prefix}-disabled-now.png`);
    await press(page, existing.getByRole('button', { name: '删除记录', exact: true }), `${prefix}-delete-pressed.png`);
    const confirm = page.getByRole('dialog', { name: '删除记录', exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await page.screenshot({ path: `${prefix}-disabled-date.png` });
  });
}
