const { test, expect } = require('@playwright/test');
const { homeCardFixture } = require('./home-card-fixture');
const fs = require('node:fs/promises');
const path = require('node:path');
async function setup(page) {
  const state = { items: homeCardFixture(), calls: [], fail: false };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({type:'string',data:'home-card-fixture'})));
  const respond = async route => {
    const method = route.request().method(), url = new URL(route.request().url());
    if (method !== 'GET') {
      state.calls.push({ method, path: url.pathname, body: route.request().postData() ? route.request().postDataJSON() : null });
      if (state.fail) return route.fulfill({ json: { rscode: '1', result: '模拟保存失败' } });
      if (method === 'DELETE') state.items = homeCardFixture();
      else if (url.pathname.endsWith('/order')) {
        const { group, keys } = route.request().postDataJSON();
        state.items = state.items.map(item => item.group === group ? { ...item, sortOrder: keys.indexOf(item.cardKey) } : item).sort((a,b) => a.group.localeCompare(b.group) || a.sortOrder-b.sortOrder);
      } else {
        const key = decodeURIComponent(url.pathname.split('/').at(-1));
        state.items = state.items.map(item => item.cardKey === key ? { ...item, enabled: route.request().postDataJSON().enabled } : item);
      }
    }
    return route.fulfill({ json: { rscode: '0', data: state.items } });
  };
  await page.route('**/api/user/info', route => route.fulfill({ json: { rscode: '0', data: { id: 'fixture-home-card-user', nickname: '测试用户' } } }));
  await page.route('**/api/auth/secondary-lock/menus', route => route.fulfill({ json: { rscode: '0', data: [] } }));
  await page.route('**/api/home/cards', respond);
  await page.route('**/api/home/cards/*', respond);
  await page.goto('/#/pages/home-settings/index');
  await expect(page.locator('.preference-row')).toHaveCount(16);
  return state;
}
async function touchDrag(page, from, to) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await to.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled:true, maxTouchPoints:1 });
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});
  await page.waitForTimeout(400);
  for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2+(b.y-a.y)*i/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
}
test('开关即时保存、失败回退、拖动排序和刷新恢复', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const state = await setup(page);
  const first = page.locator('.preference-row').first();
  await first.locator('uni-switch').click();
  await expect.poll(() => state.items[0].enabled).toBe(false);
  state.fail = true;
  await first.locator('uni-switch').click();
  await expect(page.locator('.uni-switch-input').first()).not.toHaveClass(/uni-switch-input-checked/);
  expect(state.items[0].enabled).toBe(false);
  state.fail = false;
  await touchDrag(page, first.locator('.drag-handle'), page.locator('.preference-row').nth(2).locator('.drag-handle'));
  await expect.poll(() => state.calls.filter(call => call.path.endsWith('/order')).length).toBe(1);
  expect(state.calls.at(-1).body).toEqual({group:'overview',keys:['overview.github','overview.exercise','overview.leetcode','overview.shanbay','overview.read']});
  await page.reload();
  await expect(page.locator('.card-name').first()).toHaveText('GitHub');
  await page.getByRole('button', { name: '恢复默认', exact:true }).click();
  await page.getByRole('button', { name:'确认', exact:true }).click();
  await expect(page.locator('.card-name').first()).toHaveText('每日一题');
  expect(state.items.every(item=>item.enabled)).toBe(true);

});
for (const width of [390,820,1440]) for (const dark of [false,true]) {
  test(`布局 ${width} ${dark?'dark':'light'}`, async ({page}) => {
    await page.setViewportSize({width,height:960});
    await page.addInitScript(dark => localStorage.setItem('aio-life-mobile.theme.v1', JSON.stringify({type:'string',data:dark?'dark':'light'})),dark);
    await setup(page);
    const output = path.resolve('artifacts/home-card-preferences'); await fs.mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,`mobile-${width}-${dark?'dark':'light'}.png`),fullPage:true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.drag-handle').first()).toBeVisible();
  });
}

test('全部关闭不请求业务，GitHub 详情可独立于概览启用', async ({page}) => {
  const state = await setup(page);
  const calls = [];
  page.on('request', req => { const url=new URL(req.url()); if(url.pathname.startsWith('/api/')) calls.push(url.pathname); });
  await page.route('**/api/dashboard/tasks', route=>route.fulfill({json:{rscode:'0',data:[{type:'GITHUB',title:'GitHub',icon:'mdi:github'}]}}));
  for(const suffix of ['', '?*']) await page.route('**/api/github/recent-commits'+suffix, route=>route.fulfill({json:{rscode:'0',data:[{id:'test',repo:'fixture',message:'模拟提交',date:'2026-10-04T10:00:00'}]}}));
  state.items=state.items.map(item=>({...item,enabled:false}));
  await page.goto('/#/pages/home/index');
  await expect(page.locator('.dashboard-content')).toBeVisible();
  await page.waitForTimeout(200);
  expect(calls.filter(path=>path.startsWith('/api/dashboard/card/')||path==='/api/github/recent-commits'||path==='/api/thought/dashboard')).toEqual([]);
  await expect(page.locator('.section-cell,.business-cell,.overview-cell')).toHaveCount(0);
  state.items=state.items.map(item=>({...item,enabled:item.cardKey==='section.github'}));
  await page.reload();
  await expect(page.getByText('模拟提交',{exact:true})).toBeVisible();
  await expect(page.locator('.overview-cell')).toHaveCount(0);
  expect(calls.filter(path=>path.startsWith('/api/dashboard/card/'))).toEqual([]);
});
