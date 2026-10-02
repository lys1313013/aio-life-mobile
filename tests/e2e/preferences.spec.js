const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
async function setup(page) {
 const state={writes:[],fail:false,unlock:false,security:[] ,notifications:[]};
 await page.route('http://127.0.0.1:5180/api/**', async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  let data=dashboardFixture(path);
  if(path==='/api/auth/login')data={accessToken:'preferences-fixture'};
  if(path==='/api/user/info')data={id:'9007199254740993',nickname:'设置测试'};
  if(path==='/api/menu/all')data=[{name:'记录',meta:{menuId:'root',title:'记录'},children:[{name:'笔记',meta:{menuId:'9223372036854775807',title:'笔记'}}]}];
  if(path==='/api/auth/secondary-lock/menus'){data=[];if(method==='PUT'){state.security.push(route.request().postDataJSON());data=true;}}
  if(path==='/api/auth/secondary-password/status')data={hasPassword:true};
  if(path==='/api/notification/channels/feishu'){data={configured:true,enabled:true,appId:'fixture-app',receiverOpenId:'fixture-open'};if(method==='PUT')state.notifications.push(route.request().postDataJSON());}
  if(path==='/api/notification/preferences')data=[{bizType:'fixture-visible',visible:true,description:'通知事件',channels:[{channel:'EMAIL',enabled:true}]},{bizType:'fixture-hidden',visible:false,description:'隐藏事件',channels:[{channel:'STATION',enabled:true}]}];
  if(path==='/api/api-key/list'){
   if(!state.unlock)return route.fulfill({json:{rscode:'2001',result:'需要二级密码验证',data:{menuPath:'/profile'}}});
   data=[];
  }
  if(path==='/api/auth/secondary-verify') {state.unlock=true;data={menuPath:'/profile'};}
  if(path==='/api/menu/preferences')data={menus:[{id:'root',title:'记录',children:[{id:'9223372036854775807',title:'笔记',children:[]}]}],hiddenMenuIds:[]};
  if(path==='/api/llm/key/list')data=[{id:'9223372036854775807',modelName:'fixture-model',hasApiKey:true,baseUrl:'https://example.test/v1',isDefault:1}];
  if(path==='/api/llm/key'||path==='/api/auth/change-password'){
   state.writes.push({path,body:route.request().postDataJSON()});
   if(state.fail)return route.fulfill({json:{rscode:'1',result:'保存失败，请重试'}});
   data=null;
  }
  if(path==='/api/menu/preferences'&&method==='PUT')state.writes.push({path,body:route.request().postDataJSON()});
  return route.fulfill({json:{rscode:'0',data:data??[]}});
 });
 await page.goto('/');
 await page.locator('[aria-label="账号"] input').fill('fixture');
 await page.locator('[aria-label="密码"] input').fill('fixture-password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.locator('.dashboard-scroll')).toBeVisible();
 return state;
}
test('修改密码校验、失败保留和重试；大模型编辑不回传掩码',async({page})=>{
 const state=await setup(page);
 await page.goto('/#/pages/profile/preferences?section=password');
 await page.getByRole('button',{name:'修改密码',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'修改密码',exact:true});
 await dialog.locator('[aria-label="旧密码"] input').fill('old-fixture');
 await dialog.locator('[aria-label="新密码"] input').fill('new-fixture');
 await dialog.locator('[aria-label="确认密码"] input').fill('bad');
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('两次输入');
 expect(state.writes).toHaveLength(0);
 await dialog.locator('[aria-label="确认密码"] input').fill('new-fixture');state.fail=true;
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('保存失败');
 await expect(dialog.locator('[aria-label="新密码"] input')).toHaveValue('new-fixture');state.fail=false;
 await dialog.getByRole('button',{name:'保存',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect(state.writes.at(-1).body).toEqual({oldPassword:'old-fixture',newPassword:'new-fixture'});
 await page.goto('/#/pages/profile/preferences?section=llm');
 await page.reload();
 await page.getByRole('button',{name:'编辑',exact:true}).click();
 const llm=page.getByRole('dialog',{name:'大模型配置',exact:true});
 await expect(llm.locator('[aria-label="API Key"] input')).toHaveValue('');
 await llm.getByRole('button',{name:'保存',exact:true}).click();
 await expect(llm).toHaveCount(0);
 expect(state.writes.at(-1).body).not.toHaveProperty('apiKey');
 expect(state.writes.at(-1).body.id).toBe('9223372036854775807');
});
test('接口菜单锁解锁后重试一次，隐藏菜单保留长ID',async({page})=>{
 const state=await setup(page);
 await page.goto('/#/pages/profile/preferences?section=keys');
 const dialog=page.getByRole('dialog',{name:'解锁菜单',exact:true});
 await expect(dialog).toBeVisible();
 await dialog.locator('[aria-label="二级密码"] input').fill('fixture-secondary');
 await dialog.getByRole('button',{name:'解锁',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'新增',exact:true})).toBeEnabled();
 expect(state.unlock).toBe(true);
 await page.goto('/#/pages/profile/preferences?section=menus');
 await page.reload();
 await page.locator('[aria-label="显示记录 / 笔记"]').click();
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0].body).toEqual({menuIds:['9223372036854775807']});
});
for(const width of [390,768,1440])for(const theme of ['light','dark'])test(`设置布局 ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});await setup(page);
 await page.goto('/#/pages/profile/preferences?section=llm');
 await page.reload();
 await page.getByRole('button',{name:'新增',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'大模型配置',exact:true});await expect(panel).toBeVisible();
 const box=await panel.boundingBox();expect(box.width).toBeLessThanOrEqual(Math.min(width-32,520));expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(901);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/preferences-${width}-${theme}.png`,fullPage:true});
});

test('菜单锁使用完整字符串ID与二级密码；通知留空保留应用凭证',async({page})=>{
 const state=await setup(page);
 await page.goto('/#/pages/profile/security');
 await page.locator('[aria-label="锁定记录 / 笔记"]').click();
 await page.getByRole('button',{name:'保存菜单锁',exact:true}).click();
 const lock=page.getByRole('dialog',{name:'确认菜单锁',exact:true});
 await lock.locator('[aria-label="二级密码"] input').fill('secondary-fixture');
 await lock.getByRole('button',{name:'保存',exact:true}).click();
 await expect(lock).toHaveCount(0);
 expect(state.security[0]).toEqual({menuIds:['9223372036854775807'],secondaryPassword:'secondary-fixture'});
 await page.goto('/#/pages/profile/notifications');
 await page.getByRole('button',{name:'配置飞书',exact:true}).click();
 const notification=page.getByRole('dialog',{name:'飞书通知配置',exact:true});
 await expect(notification.locator('[aria-label="App Secret"] input')).toHaveValue('');
 await notification.getByRole('button',{name:'保存',exact:true}).click();
 await expect(notification).toHaveCount(0);
 expect(state.notifications[0]).toEqual({enabled:true,appId:'fixture-app',openId:'fixture-open'});
});

test('离开锁定页面取消等待，返回不保留二级密码',async({page})=>{
 await setup(page);
 await page.evaluate(()=>new Promise(resolve=>uni.navigateTo({url:'/pages/profile/preferences?section=keys',success:resolve})));
 const dialog=page.getByRole('dialog',{name:'解锁菜单',exact:true});
 await expect(dialog).toBeVisible();
 await dialog.locator('[aria-label="二级密码"] input').fill('temporary-secondary');
 await page.evaluate(()=>new Promise(resolve=>uni.navigateTo({url:'/pages/profile/security',success:resolve})));
 await expect(dialog).toHaveCount(0);
 await page.evaluate(()=>new Promise(resolve=>uni.navigateBack({success:resolve})));
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('[aria-label="二级密码"] input')).toHaveValue('');
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await expect(dialog).toHaveCount(0);
});
