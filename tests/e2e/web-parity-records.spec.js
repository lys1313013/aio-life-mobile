const {test,expect}=require('@playwright/test');
const {setup}=require('./qa-records-fixtures');
const fs=require('fs');
const dir='artifacts/web-parity/records';fs.mkdirSync(dir,{recursive:true});
const entries=[['activity','/record/performance','活动'],['honor','/record/honor','荣誉'],['anniversary','/record/anniversary','纪念日'],['milestones','/record/milestone','里程碑']].map(([menuId,path,title])=>({menuId,path,title}));
for(const width of [390,768,1440])for(const dark of [false,true])for(const entry of entries)test(`${entry.menuId} ${width} ${dark?'dark':'light'}`,async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:dark?'dark':'light'});
  const state=await setup(page);
  for(const key of ['activity','honors','anniversaries','milestones'])state[key]=Array.from({length:4},(_,i)=>({...state[key][0],id:String(100+i)}));
  state.activity[1].performanceName='跨越山海的音乐现场';state.activity[2].performer='';
  state.honors[0].title='年度优秀项目成果奖';state.honors[0].description='记录阶段性成长与重要成果';
  state.anniversaries[1].color='from-gray-700 to-gray-900';state.anniversaries[1].targetDate='2025-01-01';
  state.milestones[1].date='2026-08-11';state.milestones[2].date='2025-09-01';
  await page.route('**/api/quick-nav/candidates',r=>r.fulfill({json:{rscode:'0',data:entries}}));
  await page.route('**/api/menu/preferences',r=>r.fulfill({json:{rscode:'0',data:{menus:entries.map(x=>({id:x.menuId,title:x.title,children:[]})),hiddenMenuIds:[]}}}));
  await page.locator('uni-tabbar').getByText('全部',{exact:true}).click();await page.getByRole('button',{name:entry.title,exact:true}).click();
  await expect(page.getByRole('button',{name:'新增'+(entry.menuId==='activity'?'活动':entry.title),exact:true})).toBeVisible();
  const prefix=`${dir}/${entry.menuId}-${width}-${dark?'dark':'light'}`;
  await page.screenshot({path:prefix+'-page.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(entry.menuId==='anniversary') {await page.getByRole('button',{name:/更多操作/}).first().click();await page.getByRole('button',{name:'编辑纪念日',exact:true}).click();}
  else if(entry.menuId==='milestones') await page.getByRole('button',{name:/^编辑里程碑：/}).first().click();
  else await page.getByRole('button',{name:new RegExp('^编辑'+entry.title+'：')}).first().click();
  const dialog=page.locator('[role=dialog]:visible');await expect(dialog).toBeVisible();
  await page.screenshot({path:prefix+'-dialog.png'});
  if(entry.menuId==='anniversary') {await expect(page.getByRole('button',{name:'浪漫粉',exact:true})).toBeVisible();await page.getByRole('button',{name:'清新蓝',exact:true}).click();}
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
