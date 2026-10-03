const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
async function setup(page, override) {
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (override && await override(route, path)) return;
    let data = dashboardFixture(path);
    if (path === '/api/auth/login') data = { accessToken: 'dashboard-fixture' };
    if (path === '/api/user/info') data = { id: '1', nickname: '测试用户' };
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('test');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  // 首页分区并行加载会调整卡片位置；坐标手势必须在首屏布局稳定后开始。
  await page.waitForLoadState('networkidle');
}
async function swipeCardUp(page, selector) {
  const card = page.locator(selector);
  await card.evaluate(el => el.scrollIntoView({block:'center'}));
  const box = await card.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await client.send('Input.synthesizeScrollGesture', {
    x: box.x + box.width / 2, y: box.y + box.height - 20,
    yDistance: -(box.height - 40), speed: 500, gestureSourceType: 'touch',
  });
  await client.detach();
}
test('统计卡和内容卡独立失败、重试恢复，隐藏闪念不暴露原文', async ({ page }) => {
  let cards = 0, thoughts = 0;
  await setup(page, async (route, path) => {
    if ((path === '/api/dashboard/card/GITHUB' && ++cards === 1) || (path === '/api/thought/dashboard' && ++thoughts === 1)) {
      await route.fulfill({ status: 503, body: 'unavailable' }); return true;
    }
  });
  await expect(page.getByText('1h30m')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试GitHub', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试GitHub', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新GitHub', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试闪念' }).click();
  await expect(page.getByText('记录想法，让行动更清晰。')).toBeVisible();
  await expect(page.getByText('内容已隐藏')).toBeVisible();
  await expect(page.getByText('PRIVATE HIDDEN CONTENT')).toHaveCount(0);
  expect(cards).toBe(2); expect(thoughts).toBe(2);
});
test('首页并行接口的 401 清理登录态，只跳转一次', async ({ page }) => {
  await setup(page, async (route, path) => {
    if (path === '/api/dashboard/card/GITHUB' || path === '/api/thought/dashboard') {
      await route.fulfill({ status: 401, body: '未授权' }); return true;
    }
  });
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
});
test('空账号不伪造统计和记录，不请求未绑定 GitHub，手机可滚动到页面底部', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let github = 0;
  await setup(page, async (route, path) => {
    if (path === '/api/github/recent-commits') github++;
    const empty = { '/api/dashboard/tasks': [], '/api/quick-nav/my': [], '/api/thought/dashboard': [], '/api/taskDetails/watched': [], '/api/exerciseRecord/dashboardSummary': { days: [] }, '/api/timeRecord/query': { items: [] } };
    if (path in empty) { await route.fulfill({ json: { rscode: '0', data: empty[path] } }); return true; }
  });
  await expect(page.getByText('今日暂无记录')).toBeVisible();
  await expect(page.getByText('暂无快捷方式')).toBeVisible();
  await page.getByText('闪念', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('暂无固定的闪念')).toBeVisible();
  await expect(page.getByText('最近提交', { exact: true })).toHaveCount(0);
  await expect(page.getByText('运动', { exact: true })).toHaveCount(0);
  expect(github).toBe(0);
});
test('运动分页失败保留已有记录，重试使用同一游标', async ({ page }) => {
  let next = 0;
  await setup(page, async (route, path) => {
    if (path !== '/api/exerciseRecord/dashboardSummary') return false;
    const cursor = new URL(route.request().url()).searchParams.get('lastDate');
    if (cursor) {
      expect(cursor).toBe('2026-09-28');
      if (++next === 1) { await route.abort(); return true; }
      await route.fulfill({ json: { rscode: '0', data: { days: [{ date: '2026-09-27', items: [{ exerciseTypeId: '2', typeLabel: '骑行', count: 15 }] }], hasMore: false } } }); return true;
    }
    await route.fulfill({ json: { rscode: '0', data: { ...dashboardFixture(path), hasMore: true, lastDate: '2026-09-28' } } }); return true;
  });
  await swipeCardUp(page, '.exercise-scroll');
  await expect(page.locator('.exercise-main').filter({ hasText: /^跑步\s*5$/ })).toBeAttached();
  await page.getByRole('button', { name: '加载失败，重试更多运动' }).click();
  await expect(page.locator('.exercise-main').filter({ hasText: /^骑行\s*15$/ })).toBeAttached();
  expect(next).toBe(2);
});

test('首页关注待办失败可重试，完成只提交长ID与状态',async({page})=>{
  let fail=true;const writes=[];const detail={id:'9223372036854775807',taskId:'9223372036854775806',content:'模拟关注待办',isCompleted:0};
  await page.route(new URL('/api/**',test.info().project.use.baseURL).href,async route=>{
    const path=new URL(route.request().url()).pathname;let data=dashboardFixture(path);
    if(path==='/api/auth/login')data={accessToken:'dashboard-action-fixture'};
    if(path==='/api/user/info')data={id:'fixture-user',nickname:'模拟首页'};
    if(path==='/api/taskDetails/watched')data=[detail];
    if(path==='/api/taskDetails'&&route.request().method()==='PUT'){
      const payload=route.request().postDataJSON();writes.push(payload);
      if(fail)return route.fulfill({json:{rscode:'1',result:'模拟更新失败'}});
      detail.isCompleted=payload.isCompleted;data=true;
    }
    return route.fulfill({json:{rscode:'0',data:data??[]}});
  });
  await page.goto('/');await page.locator('[aria-label="账号"] input').fill('fixture');await page.locator('[aria-label="密码"] input').fill('fixture-password');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'完成待办',exact:true}).click();await expect(page.getByText('模拟更新失败')).toBeVisible();
  fail=false;await page.getByRole('button',{name:'重试待办',exact:true}).click();await page.getByRole('button',{name:'完成待办',exact:true}).click();
  await expect(page.getByRole('button',{name:'标记未完成',exact:true})).toBeVisible();
  expect(writes.at(-1)).toEqual({id:'9223372036854775807',isCompleted:1});
  const home=page.url();
  await page.getByRole('button',{name:'编辑待办 模拟关注待办',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'编辑待办',exact:true});
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox',{name:'内容',exact:true})).toHaveValue(detail.content);
  await expect(page).toHaveURL(home);
});

for (const width of [390, 768, 1440]) {
  test(`运动卡片在 ${width}px 内上滑分页，加载不撑高卡片、无重复请求`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let next = 0, finish;
    const initial = Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${30-i}`, items: [{ exerciseTypeId: '1', typeLabel: '俯卧撑', count: 82, deltaCount: 57, color: '#3b82f6', trend: [30, 40, 25, 70, 82].map((count, j) => ({date: `2026-09-${20+j}`, count})) }] }));
    await setup(page, async (route, path) => {
      if (path !== '/api/exerciseRecord/dashboardSummary') return false;
      const cursor = new URL(route.request().url()).searchParams.get('lastDate');
      if (!cursor) { await route.fulfill({json:{rscode:'0',data:{days:initial,hasMore:true,lastDate:'2026-09-24'}}}); return true; }
      expect(cursor).toBe('2026-09-24'); next++;
      await new Promise(resolve => { finish = resolve; });
      await route.fulfill({json:{rscode:'0',data:{days:[{date:'2026-09-23',items:[{exerciseTypeId:'2',typeLabel:'深蹲',count:50,deltaCount:-10}]}],hasMore:false}}}); return true;
    });
    const scroll = page.locator('.exercise-scroll');
    await expect(scroll).toBeVisible();
    await scroll.evaluate(el => el.scrollIntoView({block:'center'}));
    const section = page.locator('.dashboard-section').filter({has:scroll});
    const before = await section.boundingBox();
    await expect(page.getByRole('button',{name:'加载更多运动',exact:true})).toHaveCount(0);
    const row = scroll.locator('.exercise-item').first();
    const bounds = await row.evaluate(el => ['.exercise-date','.exercise-main','.exercise-delta','.trend'].map(selector => {const r=el.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    for(let i=1;i<bounds.length;i++){expect(bounds[i].left).toBeGreaterThanOrEqual(bounds[i-1].right);expect(Math.min(bounds[0].bottom,bounds[i].bottom)-Math.max(bounds[0].top,bounds[i].top)).toBeGreaterThan(0);}
    await swipeCardUp(page, '.exercise-scroll');
    await expect.poll(()=>next).toBe(1);
    await expect(page.getByRole('status',{name:'正在加载更多运动'})).toBeAttached();
    await swipeCardUp(page, '.exercise-scroll');
    expect(next).toBe(1);
    finish();
    await expect(scroll.locator('.exercise-name').filter({hasText:'深蹲'})).toBeAttached();
    const after = await section.boundingBox();
    expect(after.height).toBe(before.height);
    expect(Math.abs(after.y-before.y)).toBeLessThan(2);
    await swipeCardUp(page, '.exercise-scroll');
    expect(next).toBe(1);
  });
}

test('最近提交在卡片内部上滑加载下一页', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  const pages=[];
  await setup(page, async (route,path)=>{
    if(path!=='/api/github/recent-commits')return false;
    const current=Number(new URL(route.request().url()).searchParams.get('page'));pages.push(current);
    await route.fulfill({json:{rscode:'0',data:Array.from({length:current===1?10:1},(_,i)=>({id:`${current}-${i}`,repo:'fixture-repo',message:`模拟提交 ${current}-${i}`,date:'2026-09-30T12:00:00'}))}});return true;
  });
  await expect(page.locator('.commits-scroll')).toBeAttached();
  for(let i=0;i<4&&pages.length===1;i++)await swipeCardUp(page,'.commits-scroll');
  await expect(page.getByText('模拟提交 2-0',{exact:true})).toBeAttached();
  expect(pages).toEqual([1,2]);
  await expect(page.getByRole('button',{name:'加载更多提交',exact:true})).toHaveCount(0);
});
