const { test, expect } = require('./support/test');
const { stableBox } = require('./support/geometry');
const { waitForMotion } = require('./support/motion');
const spacing = require('../../src/styles/spacing.json');

const person = {
  id: '9223372036854775801', name: '模拟小林', category: '社会',
  description: '一起学习和跑步的朋友', birthday: '1994-03-12', phone: '13800000000',
  email: 'example@example.com', undergraduateSchool: '模拟大学', avatar: 'https://example.com/avatar.png',
  primarySchool: '模拟小学', juniorHighSchool: '模拟初中', highSchool: '模拟高中',
  mastersSchool: '模拟硕士学校', doctoralSchool: null,
  tags: '同学,跑步', socialLinks: 'https://example.com/profile', notes: '每月约一次晨跑',
  relationships: [],
};
const ok = data => ({ json: { code: 0, message: null, data } });
const failure = message => ({ json: { code: 400, message, data: null } });
const editor = page => page.getByRole('region', { name: '编辑人物', exact: true });

async function start(page, apiMock, { failEditorLoad = false, pendingLoad } = {}) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'person-editor-fixture'));
  const state = { requests: [], paths: [], fail: false, deleted: false };
  let reads = 0;
  apiMock({
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/user/info': ok({ id: '1', nickname: '模拟用户' }),
    'GET /api/relationships/graph': () => ok({ nodes: state.deleted ? [] : [person], edges: [] }),
    [`GET /api/relationships/persons/${person.id}`]: async () => {
      if (++reads === 2) {
        await pendingLoad;
        if (failEditorLoad) return failure('模拟加载失败');
      }
      return ok(person);
    },
    [`PUT /api/relationships/persons/${person.id}`]: request => {
      state.requests.push(request.postDataJSON());
      state.paths.push(new URL(request.url()).pathname);
      return state.fail ? failure('模拟保存失败') : ok(person);
    },
    [`DELETE /api/relationships/persons/${person.id}`]: () => {
      state.deleted = true;
      return ok(null);
    },
  });
  await page.goto('/#/pages/relationship/index');
  await page.getByRole('button', { name: person.name, exact: true }).click();
  await page.getByRole('button', { name: '编辑人物', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`relationship/person-edit\\?id=${person.id}$`));
  return state;
}

test('person editor shows fields directly and retains edits after failure', async ({ page, apiMock }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await start(page, apiMock);
  const form = editor(page);
  for (const name of ['联系信息', '教育经历', '更多资料']) {
    await expect(form.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await form.getByRole('textbox', { name: '电话', exact: true }).fill('13900000000');
  await expect(form.getByRole('textbox', { name: '本科学校', exact: true })).toHaveValue('模拟大学');
  await form.getByRole('textbox', { name: '博士学校', exact: true }).fill('模拟博士学校');
  await expect(form.getByRole('textbox', { name: '头像URL', exact: true })).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: '社交链接', exact: true })).toHaveCount(0);
  await form.getByRole('textbox', { name: '备注', exact: true }).fill('更新后的晨跑安排');
  state.fail = true;
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('模拟保存失败');
  const { id, relationships, ...editableFields } = person;
  expect(state.paths[0]).toBe(`/api/relationships/persons/${id}`);
  expect(state.requests[0]).toEqual({
    ...editableFields, phone: '13900000000', notes: '更新后的晨跑安排', doctoralSchool: '模拟博士学校',
  });
  await expect(form.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('更新后的晨跑安排');
  state.fail = false;
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`relationship/person\\?id=${person.id}$`));
  await expect(page.getByRole('button', { name: '编辑人物', exact: true })).toContainText(person.name);
  expect(state.requests[1]).toEqual(state.requests[0]);
  expect(state.paths).toEqual([`/api/relationships/persons/${id}`, `/api/relationships/persons/${id}`]);
});

test('person editor retries loading, discards cancelled edits and requires a name', async ({ page, apiMock }) => {
  await start(page, apiMock, { failEditorLoad: true });
  const form = editor(page);
  await expect(page.getByRole('alert')).toContainText('模拟加载失败');
  await expect(form.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  const notes = form.getByRole('textbox', { name: '备注', exact: true });
  await notes.fill('未保存的备注');
  await form.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`relationship/person\\?id=${person.id}$`));
  await page.getByRole('button', { name: '编辑人物', exact: true }).click();
  await expect(notes).toHaveValue(person.notes);
  await form.getByRole('textbox', { name: '姓名', exact: true }).fill('');
  await form.getByRole('button', { name: '保存', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('请输入姓名');
  await expect(form.getByRole('textbox', { name: '姓名', exact: true })).toBeVisible();
});

test('person deletion returns past the deleted detail to the updated graph', async ({ page, apiMock }) => {
  const state = await start(page, apiMock);
  const form = editor(page);
  const remove = form.getByRole('button', { name: '删除人物和关联关系', exact: true });
  const confirmation = page.getByRole('dialog', { name: '删除人物和关联关系', exact: true });
  await remove.click();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(state.deleted).toBe(false);
  await remove.click();
  await confirmation.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page).toHaveURL(/relationship\/index$/);
  await expect(page.getByText('暂无人物', { exact: true })).toBeVisible();
  expect(state.deleted).toBe(true);
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`person editor visual ${width} ${theme}`, async ({ page, apiMock }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseLoad;
    const pendingLoad = new Promise(resolve => { releaseLoad = resolve; });
    const screenshot = state => page.screenshot({ path: `artifacts/relationship-person-editor/editor-${width}-${theme}-${state}.png` });
    let loadingBox;
    try {
      await start(page, apiMock, { pendingLoad });
      const loading = page.getByRole('status', { name: '正在加载人物资料', exact: true });
      await expect(loading).toBeVisible();
      await waitForMotion(page);
      loadingBox = await stableBox(page.locator('.page-state-placeholder .editor-card'));
      const fields = loading.locator('.form-skeleton-input');
      await expect(fields).toHaveCount(14);
      await expect(loading.locator('.form-skeleton-input .form-skeleton-line')).toHaveCount(0);
      await expect(fields.first()).toHaveCSS('border-top-width', '0px');
      await expect(fields.first()).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await screenshot('loading');
    } finally {
      releaseLoad();
    }
    const form = editor(page);
    await expect(form.getByRole('textbox', { name: '电话', exact: true })).toBeInViewport();
    const loadedBox = await stableBox(form);
    expect(loadedBox.y).toBeCloseTo(loadingBox.y, 0);
    expect(loadedBox.width).toBeCloseTo(loadingBox.width, 0);
    expect(Math.abs(loadedBox.height - loadingBox.height)).toBeLessThanOrEqual(spacing.section);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForMotion(page);
    await screenshot('top');
    const fieldSurfaces = await page.locator('.editor-card[role="region"] .form-field-input').evaluateAll(fields => fields.map(field => {
      const style = getComputedStyle(field);
      const card = getComputedStyle(field.closest('[role="region"]'));
      return style.backgroundColor === card.backgroundColor && parseFloat(style.borderTopWidth) > 0;
    }));
    expect(fieldSurfaces).toHaveLength(14);
    expect(fieldSurfaces.every(Boolean)).toBe(true);
    await page.mouse.move(width / 2, 580);
    await page.mouse.wheel(0, 1200);
    await expect(form.getByRole('textbox', { name: '备注', exact: true })).toBeInViewport();
    await expect(form.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
    await expect(form.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
    const remove = form.getByRole('button', { name: '删除人物和关联关系', exact: true });
    await expect(remove).toBeInViewport();
    await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const hitArea = await remove.boundingBox();
    expect(hitArea.width).toBeGreaterThanOrEqual(spacing.controlMin);
    expect(hitArea.height).toBeGreaterThanOrEqual(spacing.controlMin);
    await screenshot('bottom');
    const cancel = await form.getByRole('button', { name: '取消', exact: true }).boundingBox();
    const save = await form.getByRole('button', { name: '保存', exact: true }).boundingBox();
    expect(cancel.x + cancel.width).toBeLessThanOrEqual(save.x);
    expect(Math.abs(cancel.y - save.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
