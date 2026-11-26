const { dismissModal } = require('./modal');
const { test, expect } = require('./support/test');
const { waitForMotion } = require('./support/motion');
const { setup } = require('./qa-domains-fixtures');
const path = require('node:path');
const names = ['模拟本人', '模拟小林', '模拟小周', '模拟小陈', '模拟小许', '模拟小唐', '模拟小沈', '模拟小吴', '模拟小郑', '模拟小王', '模拟小李', '模拟小方', '模拟长姓名人物'];
const nodes = names.map((name, i) => ({ id: String(9223372036854775800n + BigInt(i)), name, category: ['其他', '亲属', '社会', '情感'][i % 4] }));
const edges = nodes.slice(1).map((node, i) => ({ source: nodes[0].id, target: node.id, relationType: ['朋友', '同事', '同学', '兄弟姐妹', '配偶', '父亲'][i % 6], direction: i % 2 ? '双向' : '单向' }));
edges.push({ source: nodes[2].id, target: nodes[3].id, relationType: '朋友', direction: '双向' });
async function start(page) {
  await setup(page);
  await page.route('**/api/relationships/**', async route => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.endsWith('/graph')) data = { nodes, edges };
    else data = { ...nodes.find(node => url.pathname.endsWith('/' + node.id)), relationships: [] };
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto('/#/pages/relationship/index');
  await expect(page.locator('.graph-node-button')).toHaveCount(13);
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`relationship layout ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await start(page);
    const boxes = await page.locator('.graph-node-button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; }));
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i].w).toBeGreaterThanOrEqual(44);
      expect(boxes[i].h).toBeGreaterThanOrEqual(44);
      for (let j = i + 1; j < boxes.length; j++) {
        const a=boxes[i], b=boxes[j];
        expect(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y).toBe(true);
      }
    }
    const canvas = page.locator('.topology');
    const stage = await canvas.boundingBox();
    expect(stage.x).toBe(0);
    expect(stage.width).toBe(width);
    expect(stage.y + stage.height).toBeCloseTo(844, 0);
    await expect(page.locator('.graph-light')).toHaveCount(5);
    const firstDot = page.locator('.graph-light').first();
    const firstPosition = await firstDot.getAttribute('style');
    await expect.poll(() => firstDot.getAttribute('style')).not.toBe(firstPosition);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const tools = await page.locator('.graph-tools').boundingBox();
    const add = page.getByRole('button', { name: '新增人物', exact: true });
    const addBox = await add.boundingBox();
    expect(tools.x).toBeLessThan(addBox.x);
    expect(Math.abs(tools.y + tools.height - addBox.y - addBox.height)).toBeLessThan(6);
    await page.screenshot({ path: path.resolve(`test-results/relationship-${width}-${theme}.png`), fullPage: true });

    const world = page.locator('.graph-world');
    const initialTransform = await world.getAttribute('style');
    await canvas.hover({ position: { x: 24, y: 70 } });
    await page.mouse.wheel(0, -90);
    await expect.poll(() => world.getAttribute('style')).not.toBe(initialTransform);
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await expect(world).toHaveAttribute('style', initialTransform);
    await page.getByRole('button', { name: '图谱操作说明', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '图谱操作说明', exact: true })).toBeVisible();
    await dismissModal(page);

    const searchToggle = page.getByRole('button', { name: '展开人物搜索', exact: true });
    const search = page.getByRole('searchbox', { name: '搜索人物并定位', exact: true });
    await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(search).toHaveCount(0);
    await searchToggle.click();
    await expect(search).toBeFocused();
    await expect(page.getByText('搜索', { exact: true })).toBeVisible();
    await search.fill('小林');
    const results = page.locator('.search-results');
    await expect(results.getByRole('button')).toHaveCount(1);
    await waitForMotion(page);
    await page.screenshot({ path: path.resolve(`test-results/relationship-search-${width}-${theme}.png`) });
    await canvas.click({ position: { x: 24, y: 70 } });
    await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(results).toHaveCount(0);
    await searchToggle.click();
    await expect(search).toHaveValue('小林');
    await results.getByRole('button', { name: '模拟小林', exact: true }).click();
    await expect(search).toHaveCount(0);
    await expect(results).toHaveCount(0);
    const node = canvas.getByRole('button', { name: '模拟小林', exact: true });
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    const located = await node.boundingBox();
    expect(located.x + located.width / 2).toBeCloseTo(width / 2, 0);
    await node.click();
    await expect(page).toHaveURL(/relationship\/person\?id=/);
    await expect(page.getByRole('button', { name: '编辑人物', exact: true })).toContainText('模拟小林');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page).toHaveURL(/relationship\/index$/);
    await searchToggle.click();
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await expect(search).toHaveValue('');
    await page.getByRole('button', { name: '重置布局', exact: true }).click();
    await expect(world).toHaveAttribute('style', initialTransform);
    await add.click();
    await expect(page).toHaveURL(/relationship\/person-edit$/);
    const editor = page.getByRole('region', { name: '新增人物', exact: true });
    await expect(editor).toBeVisible();
    await page.screenshot({ path: path.resolve(`test-results/relationship-form-${width}-${theme}.png`) });
    await editor.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page).toHaveURL(/relationship\/index$/);
    expect(errors).toEqual([]);
  });
}

test('relationship touch drag does not trigger person details', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await start(page);
  const original = await page.locator('.graph-world').getAttribute('style');
  await page.locator('.topology').evaluate(el => {
    const point = (x,y) => new Touch({ identifier:1, target:el, clientX:x, clientY:y, pageX:x, pageY:y });
    for (const [type,x,y] of [['touchstart',150,400], ['touchmove',180,430], ['touchend',180,430]]) {
      el.dispatchEvent(new TouchEvent(type, { bubbles:true, cancelable:true, touches:type==='touchend'?[]:[point(x,y)], changedTouches:[point(x,y)] }));
    }
  });
  expect(await page.locator('.graph-world').getAttribute('style')).not.toBe(original);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const beforePinch = await page.locator('.graph-world').getAttribute('style');
  await page.locator('.topology').evaluate(el => {
    for (const [type, left, right] of [['touchstart', 140, 240], ['touchmove', 115, 265]]) {
      const touches = [left, right].map((x, index) => new Touch({
        identifier: index + 1, target: el, clientX: x, clientY: 400,
      }));
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches }));
    }
  });
  const scale = style => Number(style.match(/scale\(([^)]+)\)/)[1]);
  expect(scale(await page.locator('.graph-world').getAttribute('style'))).toBeCloseTo(scale(beforePinch) * 1.5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('relationship canvas clipping', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('a person dragged past the world origin remains clickable inside the canvas', async ({ page, apiMock }) => {
    const people = nodes.slice(0, 3);
    const person = people[0];
    const ok = data => ({ json: { code: 0, message: null, data } });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'graph-clipping-fixture'));
    apiMock({
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户' }),
      'GET /api/relationships/graph': ok({ nodes: people, edges: edges.slice(0, 2) }),
      [`GET /api/relationships/persons/${person.id}`]: ok({ ...person, relationships: [] }),
    });
    await page.goto('/#/pages/relationship/index');
    const node = page.getByRole('button', { name: person.name, exact: true });
    await expect(node).toBeVisible();
    await waitForMotion(page);
    const device = await page.context().newCDPSession(page);
    async function drag(from, to) {
      await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let step = 1; step <= 8; step++) {
        await device.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }],
        });
      }
      await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }

    const world = page.locator('.graph-world');
    const initial = await world.boundingBox();
    await drag({ x: 32, y: 156 }, { x: 32, y: 336 });
    await expect.poll(async () => (await world.boundingBox()).y).toBeCloseTo(initial.y + 180, 0);
    const layer = await world.boundingBox();
    const marker = node.locator('.graph-node-dot');
    const dot = await marker.boundingBox();
    const x = Math.round(dot.x + dot.width / 2);
    const y = Math.round(layer.y - 12);
    await drag({ x, y: Math.round(dot.y + dot.height / 2) }, { x, y });
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const bounds = await marker.boundingBox();
      return bounds.y + bounds.height / 2;
    }).toBeCloseTo(y, 0);
    await page.touchscreen.tap(x, y);
    await expect(page).toHaveURL(/relationship\/person\?id=/);
    await expect(page.getByRole('button', { name: '编辑人物', exact: true })).toContainText(person.name);
  });

  test('tapping a name with a small touch movement opens details and retries a failed request', async ({ page, apiMock }) => {
    const person = nodes[0];
    const ok = data => ({ json: { code: 0, message: null, data } });
    let release, requests = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'graph-details-fixture'));
    apiMock({
      'GET /api/auth/secondary-lock/menus': ok([]),
      'GET /api/user/info': ok({ id: '1', nickname: '模拟用户' }),
      'GET /api/relationships/graph': ok({ nodes: nodes.slice(0, 3), edges: edges.slice(0, 2) }),
      [`GET /api/relationships/persons/${person.id}`]: async () => {
        if (++requests === 1) {
          await pending;
          return { json: { code: 1, message: '模拟详情加载失败', data: null } };
        }
        return ok({ ...person, relationships: [] });
      },
    });
    try {
      await page.goto('/#/pages/relationship/index');
      const node = page.getByRole('button', { name: person.name, exact: true });
      await expect(node).toBeVisible();
      await waitForMotion(page);
      const label = await node.locator('.node-name').boundingBox();
      const x = Math.round(label.x + label.width / 2), y = Math.ceil(label.y + 3);
      expect(await node.evaluate((button, { x, y }) => button.contains(document.elementFromPoint(x, y)), { x, y })).toBe(true);
      const touch = await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 5, y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

      await expect(page).toHaveURL(/relationship\/person\?id=/);
      await expect(page.getByRole('status', { name: '正在加载人物详情', exact: true })).toBeVisible();
      release();
      await expect(page.getByText('模拟详情加载失败', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '重试', exact: true }).click();
      const edit = page.getByRole('button', { name: '编辑人物', exact: true });
      await expect(edit).toBeVisible();
      expect(requests).toBe(2);
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await expect(page).toHaveURL(/relationship\/index$/);
      await waitForMotion(page);
      await page.mouse.click(x, y);
      await expect(edit).toBeVisible();
      expect(requests).toBe(3);
    } finally {
      release();
    }
  });
});
