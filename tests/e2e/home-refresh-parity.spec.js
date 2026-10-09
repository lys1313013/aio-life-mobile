const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');
const { homeCardFixture } = require('./home-card-fixture');

async function setup(page, extra = {}) {
  const state = { calls: [], fail: '', delay: '', release: null, goals: '模拟固定目标', errors: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  const fixtures = {
    '/home/cards': homeCardFixture(), '/user/info': { id: 'fixture-refresh', nickname: '模拟用户' },
    '/auth/secondary-lock/menus': [], '/menu/visuals': { menus: [], cards: {} },
    '/quick-nav/candidates': ['/task-center/goal', '/my-hub/anniversary', '/my-hub/read-record', '/membership', '/my-hub/movie'].map(path => ({path})),
    '/userbinds/list': [{platform:'github',platformUsername:'fixture-user'}],
    '/taskDetails/watched': [{id:'9223372036854775807',content:'模拟待办长标题：检查刷新、日期和编辑入口是否保留完整信息',taskName:'模拟主任务',isCompleted:0,priority:1,startTime:'2026-10-09 09:00:00',endTime:'2026-10-10 18:30:00'}],
    '/anniversaryRecords': [{id:'9223372036854775806',title:'模拟纪念日',targetDate:'2027-01-01',isPinned:1}],
    '/read-record/page': {items:[{id:'9223372036854775805',title:'模拟图书',status:'in_progress'}],total:1},
    '/movie/page': {items:[{id:'9223372036854775804',title:'模拟观影',status:'in_progress'}],total:1},
    '/membership/list': [{id:'9223372036854775803',name:'模拟会员',expiryDate:'2029-10-09'}],
    '/github/recent-commits': [{id:'c1',repo:'fixture/repo',message:'模拟提交：'+ '需要在触摸端完整查看的长摘要。'.repeat(12),date:'2026-10-09T09:00:00',commitUrl:'https://github.com/fixture/repo/commit/fixture'}],
    ...extra,
  };
  await page.context().route('https://github.com/**', route=>route.fulfill({body:'Mock GitHub destination'}));
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', JSON.stringify({type:'string',data:'fixture-refresh'})));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname.slice(4);
    state.calls.push(path);
    let data=fixtures[path] ?? dashboardFixture(url.pathname) ?? [];
    if(path==='/goals')data=[{id:'9223372036854775802',title:state.goals,isPinned:1,status:'in_progress',type:1,targetValue:100,currentValue:30}];
    if(path.startsWith('/dashboard/card/'))data={...dashboardFixture(url.pathname),refreshInterval:path.endsWith('GITHUB')?300:path.endsWith('EXERCISE')?600:0,...fixtures[path]};
    if(state.delay===path)await new Promise(resolve=>{state.release=resolve});
    if(state.fail===path)return route.fulfill({json:{code:1,message:'模拟刷新失败'}});
    await route.fulfill({json:{code:0,data}});
  });
  await page.goto('/#/pages/home/index');
  await expect(page.locator('[aria-label="目标首页卡片"]')).toContainText('模拟固定目标');
  await expect(page.getByRole('button',{name:'刷新时迹',exact:true})).toBeEnabled();
  await page.waitForLoadState('networkidle');
  state.count=path=>state.calls.filter(item=>item===path).length;
  return state;
}
function section(page,title){return page.locator('.dashboard-section').filter({has:page.locator('.section-title').getByText(title,{exact:true})})}
async function visibility(page,value){await page.evaluate(value=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>value});document.dispatchEvent(new Event('visibilitychange'))},value)}

for(const width of [390,768,1440])for(const theme of ['light','dark'])test(`单卡刷新、失败保留高度与键盘入口 ${width} ${theme}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});
  const f=await setup(page), goal=page.locator('[aria-label="目标首页卡片"]');
  const baseline=Object.fromEntries(['/goals','/read-record/page','/timeRecord/query','/user/info'].map(path=>[path,f.count(path)]));
  const box=await goal.boundingBox();
  f.delay='/goals';f.goals='局部刷新后的模拟目标';
  await goal.getByRole('button',{name:'刷新目标',exact:true}).click();
  await expect.poll(()=>f.count('/goals')).toBe(baseline['/goals']+1);
  await expect(goal).toContainText('模拟固定目标');
  expect((await goal.boundingBox()).height).toBe(box.height);
  await page.screenshot({path:info.outputPath('refreshing.png'),fullPage:true});
  expect(f.count('/read-record/page')).toBe(baseline['/read-record/page']);
  f.delay='';f.release();await expect(goal).toContainText(f.goals);
  f.fail='/goals';await goal.getByRole('button',{name:'刷新目标',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(goal.getByRole('button',{name:/重试目标/})).toBeVisible();
  await expect(goal).toContainText(f.goals);expect((await goal.boundingBox()).height).toBe(box.height);
  f.fail='';await goal.getByRole('button',{name:/重试目标/}).click();await expect(goal.getByRole('button',{name:'刷新目标',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'刷新时迹',exact:true}).focus();await page.keyboard.press('Space');
  await expect.poll(()=>f.count('/timeRecord/query')).toBe(baseline['/timeRecord/query']+1);
  expect(f.count('/user/info')).toBe(baseline['/user/info']);
  await expect(section(page,'待办')).toContainText('10/9 09:00 - 10/10 18:30');
  await section(page,'待办').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('dates-and-titles.png'),fullPage:true});
  expect(f.errors).toEqual([]);
});

test('真实页面按 300/600 秒刷新，隐藏暂停、过期恢复补刷与短返回不重复',async({page})=>{
  await page.clock.install({time:new Date('2026-10-09T10:00:00+08:00')});
  const f=await setup(page);
  const github=f.count('/dashboard/card/GITHUB'),exercise=f.count('/dashboard/card/EXERCISE'),time=f.count('/timeRecord/query'),thought=f.count('/thought/dashboard');
  await page.clock.fastForward(299000);expect(f.count('/dashboard/card/GITHUB')).toBe(github);
  await page.clock.fastForward(2000);await expect.poll(()=>f.count('/dashboard/card/GITHUB')).toBe(github+1);await expect.poll(()=>f.count('/timeRecord/query')).toBe(time+1);
  expect(f.count('/dashboard/card/EXERCISE')).toBe(exercise);expect(f.count('/thought/dashboard')).toBe(thought);
  await visibility(page,'hidden');await page.clock.fastForward(600000);
  expect(f.count('/dashboard/card/GITHUB')).toBe(github+1);expect(f.count('/dashboard/card/EXERCISE')).toBe(exercise);
  await visibility(page,'visible');await expect.poll(()=>f.count('/dashboard/card/GITHUB')).toBe(github+2);await expect.poll(()=>f.count('/dashboard/card/EXERCISE')).toBe(exercise+1);
  await expect(page.getByRole('button',{name:'刷新GitHub',exact:true})).toBeEnabled();
  const before=f.count('/dashboard/card/GITHUB');await visibility(page,'hidden');await page.clock.fastForward(1000);await visibility(page,'visible');
  expect(f.count('/dashboard/card/GITHUB')).toBe(before);
  expect(f.errors).toEqual([]);
});

test('标题导航不触发刷新，提交可完整查看并访问，GitHub 主页使用公开绑定',async({page})=>{
  const f=await setup(page),commits=section(page,'最近提交');
  const before=f.count('/github/recent-commits');
  await commits.getByRole('button',{name:'访问 GitHub 主页',exact:true}).click();
  await expect.poll(()=>page.context().pages().length).toBe(2);
  const other=page.context().pages().find(item=>item!==page);await expect(other).toHaveURL('https://github.com/fixture-user');await other.close();
  await commits.getByRole('button',{name:/查看提交：/}).click();
  await expect(page.getByText('需要在触摸端完整查看的长摘要。'.repeat(12),{exact:false}).last()).toBeVisible();
  await page.getByText('查看提交',{exact:true}).click();
  await expect.poll(()=>page.context().pages().length).toBe(2);
  const commitPage=page.context().pages().find(item=>item!==page);await expect(commitPage).toHaveURL('https://github.com/fixture/repo/commit/fixture');await commitPage.close();
  expect(f.count('/github/recent-commits')).toBe(before);
  const queries=f.count('/timeRecord/query');await page.getByRole('button',{name:'查看时迹',exact:true}).click();
  await expect(page).toHaveURL(/pages\/time\/index/);
  // 业务页读取允许发生；标题只导航，不先刷新首页的分类接口。
  expect(f.count('/dashboard/tasks')).toBe(1);expect(f.count('/timeRecord/query')).toBeGreaterThanOrEqual(queries);
  expect(f.errors).toEqual([]);
});

test('锁定卡片不调度、不弹密码、不读取业务',async({page})=>{
  await page.clock.install({time:new Date('2026-10-09T10:00:00+08:00')});
  const f=await setup(page,{'/auth/secondary-lock/menus':['github-menu'],'/menu/all':[{path:'/coding/github',meta:{menuId:'github-menu'}}]});
  await expect(section(page,'最近提交')).toContainText('点击解锁');
  const count=f.count('/github/recent-commits');await page.clock.fastForward(3601000);
  expect(f.count('/github/recent-commits')).toBe(count);await expect(page.getByRole('dialog',{name:'解锁菜单',exact:true})).toHaveCount(0);
  expect(f.errors).toEqual([]);
});


test('主动解锁返回后显示提交，前台锁过期撤下旧内容并停止调度',async({page})=>{
  await page.clock.install({time:new Date('2026-10-09T10:00:00+08:00')});
  const f=await setup(page,{'/auth/secondary-lock/menus':['github-menu'],'/menu/all':[{path:'/coding/github',meta:{menuId:'github-menu'}}]});
  const commits=section(page,'最近提交'), modal=page.getByRole('dialog',{name:'解锁菜单',exact:true});
  await commits.getByRole('button',{name:'解锁最近提交',exact:true}).click();await expect(modal).toBeVisible();
  await modal.locator('input').fill('mock-secondary-password');await modal.getByRole('button',{name:'解锁',exact:true}).click();
  await expect(page).toHaveURL(/pages\/coding\/github/);
  await expect(page.locator('.record-title').filter({hasText:'模拟提交：'}).last()).toBeVisible();
  await page.clock.runFor(100);
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await expect(commits).toContainText('fixture/repo');await expect(page.getByRole('button',{name:'刷新最近提交',exact:true})).toBeEnabled();
  // 让路由返回后的 uni scroll-view 挂载 nextTick 完成，再推进长时间。
  await page.clock.runFor(100);expect(f.errors).toEqual([]);
  const count=f.count('/github/recent-commits');
  await page.clock.fastForward(29*60000+1000);
  await expect(commits).toContainText('点击解锁');await expect(commits).not.toContainText('fixture/repo');
  await page.clock.fastForward(3601000);expect(f.count('/github/recent-commits')).toBe(count);await expect(modal).toHaveCount(0);
  expect(f.errors).toEqual([]);
});

test('待办日期单边与无日期降级、提交无链接仍可完整查看',async({page})=>{
  const f=await setup(page,{'/taskDetails/watched':[
    {id:'1',content:'模拟无日期待办',isCompleted:0},
    {id:'2',content:'模拟仅开始待办',isCompleted:0,startTime:'2026-10-09T09:00:00'},
    {id:'3',content:'模拟仅结束待办',isCompleted:0,endTime:'2026-10-10 18:30:00'},
  ],'/github/recent-commits':[{id:'no-link',repo:'fixture/no-link',message:'模拟无链接的完整摘要'}]});
  const rows=section(page,'待办').locator('.task-row');
  await expect(rows.nth(0).locator('.task-dates')).toHaveCount(0);await expect(rows.nth(1)).toContainText('10/9 09:00');await expect(rows.nth(2)).toContainText('10/10 18:30');
  await section(page,'最近提交').getByRole('button',{name:/查看提交：/}).click();
  await expect(page.getByText('模拟无链接的完整摘要',{exact:true}).last()).toBeVisible();await expect(page.getByText('查看提交',{exact:true})).toHaveCount(0);
  await page.getByText('关闭',{exact:true}).click();expect(page.context().pages()).toHaveLength(1);expect(f.errors).toEqual([]);
});


test('浏览器隐藏暂停请求并保留业务编辑草稿，返回后可继续编辑',async({page})=>{
  const f=await setup(page),goal=page.locator('[aria-label="目标首页卡片"]');
  await goal.getByRole('button',{name:'编辑模拟固定目标',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'编辑目标',exact:true});await expect(dialog).toBeVisible();
  const input=dialog.locator('[aria-label="标题"] input');await input.fill('尚未保存的模拟草稿');
  await visibility(page,'hidden');await visibility(page,'visible');
  await expect(dialog).toBeVisible();await expect(input).toHaveValue('尚未保存的模拟草稿');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);expect(f.errors).toEqual([]);
});
