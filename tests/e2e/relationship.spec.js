const { dismissModal } = require('./modal');
const { test, expect } = require('@playwright/test');
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
    else if (url.pathname.endsWith('/search')) data = nodes.filter(node => node.name.includes(url.searchParams.get('keyword')));
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
    await expect(page.locator('.body')).not.toContainText('&gt;');
    await expect(page.locator('.body')).not.toContainText('>');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.resolve(`test-results/relationship-${width}-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: '放大图谱', exact: true }).click();
    await expect(page.locator('.graph-world')).toHaveAttribute('style', /scale\(1.25\)/);
    await page.getByRole('button', { name: '复位图谱', exact: true }).click();
    await expect(page.locator('.graph-world')).toHaveAttribute('style', /scale\(1\)/);
    await page.getByRole('button', { name: '隐藏关系名称', exact: true }).click();
    await expect(page.locator('.graph-edge-label')).toHaveCount(0);
    await page.getByRole('button', { name: '分类：亲属', exact: true }).click();
    await expect(page.locator('.graph-node-button')).toHaveCount(3);
    await expect(page.locator('.graph-link')).toHaveCount(0);
    await page.getByRole('button', { name: '分类：全部', exact: true }).click();
    await page.locator('.search-input input').fill('小林');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator('.search-results')).toContainText('搜索结果 · 1');
    await page.locator('.search-results').getByRole('button', { name: '模拟小林', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '模拟小林', exact: true })).toBeVisible();
    await dismissModal(page);
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await expect(page.locator('.search-results')).toHaveCount(0);
    await page.getByRole('button', { name: '新增人物', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '人物', exact: true })).toBeVisible();
    await page.screenshot({ path: path.resolve(`test-results/relationship-form-${width}-${theme}.png`) });
    await dismissModal(page);
    await page.getByRole('button', { name: '关系明细', exact: true }).click();
    await expect(page.locator('.relation-row')).toHaveCount(13);
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
});
