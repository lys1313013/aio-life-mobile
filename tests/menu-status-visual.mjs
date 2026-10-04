// Synthetic API fixtures against running dev servers; no real account or database writes.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = new URL('../artifacts/menu-status/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const id = '9223372036854775807';
const preferencesModule = '/@fs' + new URL('../../aio-life-front/packages/@core/preferences/src/index.ts',import.meta.url).pathname;
const fixtures = {
 '/user/info': {id:'7',userId:'7',username:'fixture',nickname:'模拟管理员',realName:'模拟管理员',roles:['admin'],homePath:'/system/menu'},
 '/auth/login':{accessToken:'menu-status-fixture'}, '/auth/codes':[], '/auth/secondary-lock/menus':[],
 '/auth/wechat/web/capabilities':{enabled:false}, '/message/unread-count':{count:0},
 '/menu/preferences':{menus:[],hiddenMenuIds:[]}, '/menu/admin/role-options':['admin','user'],
 '/menu/all':[{name:'System',path:'/system',component:'BasicLayout',meta:{title:'系统'},children:[{id:'2',name:'Menu',path:'/system/menu',component:'system/menu/index',meta:{title:'菜单管理'}}]}],
};
try {
 for (const platform of (process.env.MENU_VISUAL_PLATFORM ? [process.env.MENU_VISUAL_PLATFORM] : ['web','mobile'])) {
  const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
  const origin=platform==='web'?'http://127.0.0.1:5666':'http://127.0.0.1:5180';
  const state={fail:false,writes:[],row:{id,parentId:'0',name:'Sample',path:'/sample',component:'sample/index',sort:0,status:1,mobileStatus:0,roles:'admin',meta:{title:'模拟菜单',icon:'lucide:book'}}};
  if(platform==='mobile')await page.addInitScript(()=>localStorage.setItem('aio-life-mobile.access-token.v1','menu-status-fixture'));
  for(const [path,data] of Object.entries(fixtures)){
   const handler=route=>route.fulfill({json:{rscode:'0',data}});
   await page.route(origin+'/api'+path,handler);await page.route(origin+'/api'+path+'?*',handler);
  }
  await page.route(origin+'/api/menu/admin/tree',route=>route.fulfill({json:{rscode:'0',data:[state.row]}}));
  for(const field of ['status','mobile-status'])await page.route(origin+'/api/menu/admin/'+id+'/'+field,async route=>{
   const body=route.request().postDataJSON();state.writes.push({path:field,body});
   if(state.fail)return route.fulfill({json:{rscode:'1',result:'模拟切换失败'}});
   state.row[field==='status'?'status':'mobileStatus']=body.status;
   return route.fulfill({json:{rscode:'0',data:state.row}});
  });
  await page.route(origin+'/api/menu/admin/'+id,async route=>{ const body=route.request().postDataJSON(); state.writes.push({path:'edit',body}); state.row={...state.row,...body}; return route.fulfill({json:{rscode:'0',data:state.row}}); });
  await page.goto(origin+(platform==='web'?'/auth/login':'/#/pages/admin/index?kind=menus'));
  if(platform==='web'){
   await page.locator('input:not([type="password"])').first().fill('fixture');
   await page.locator('input[type="password"]').fill('fixture-password');
   await page.getByRole('button').filter({hasText:/^登录$/}).click();
   await page.waitForURL('**/system/menu');await page.getByText('模拟菜单',{exact:true}).first().click();
  }else await page.getByRole('button',{name:'模拟菜单更多操作',exact:true}).click();
  const mobileSwitch=page.locator('[aria-label="模拟菜单 移动端启用"]'),webSwitch=page.locator('[aria-label="模拟菜单 Web 启用"]');
  await expect(mobileSwitch).toBeVisible();await mobileSwitch.click();
  await expect.poll(()=>state.row.mobileStatus).toBe(1);await expect.poll(()=>state.writes.length).toBe(1);
  if(state.row.status!==1||state.writes[0].path!=='mobile-status')throw Error('mobile toggle changed Web');
  const checked=async()=>platform==='web'?expect(mobileSwitch).toHaveAttribute('aria-checked','true'):expect(mobileSwitch.locator('.uni-switch-input')).toHaveClass(/uni-switch-input-checked/);
  await checked();state.fail=true;await mobileSwitch.click();await expect.poll(()=>state.writes.length).toBe(2);
  if(platform==='mobile')await expect(page.getByRole('dialog',{name:'菜单详情'}).getByRole('alert')).toContainText('模拟切换失败');
  await checked();state.fail=false;await webSwitch.click();await expect.poll(()=>state.row.status).toBe(0);
  if(state.row.mobileStatus!==1)throw Error('Web toggle changed mobile');
  for(const width of [390,768,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme});
   if(platform==='web')await page.evaluate(async ({mode,module})=>{const {updatePreferences}=await import(module);updatePreferences({theme:{mode},sidebar:{hidden:window.innerWidth<1024}});},{mode:theme,module:preferencesModule});
   else{await page.evaluate(theme=>localStorage.setItem('aio-life-mobile.theme.v1',theme),theme);await page.reload();await page.getByRole('button',{name:'模拟菜单更多操作',exact:true}).click();}
   await expect(mobileSwitch).toBeVisible();
   if(platform==='web'){ await page.locator('.ant-notification-notice-close').evaluateAll(nodes=>nodes.forEach(node=>node.click())); await expect(page.locator('.ant-message-notice')).toHaveCount(0,{timeout:10000}); await mobileSwitch.scrollIntoViewIfNeeded(); }
   await page.screenshot({path:output+platform+'-'+width+'-'+theme+'.png',fullPage:true});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(platform+' overflow '+width);
  }
  await page.getByRole('button',{name:'编辑菜单',exact:true}).click();
  const editor=page.getByRole('dialog',{name:platform==='web'?'编辑菜单':'菜单管理',exact:true});
  await expect(editor.locator('[aria-label="移动端启用"]')).toBeVisible();
  await editor.locator('[aria-label="移动端启用"]').click();
  await (platform==='web'?editor.locator('[data-modal-confirm]'):editor.getByRole('button',{name:'保存',exact:true})).click();
  await expect.poll(()=>state.writes.at(-1)?.path).toBe('edit');
  if(state.writes.at(-1).body.mobileStatus!==0||state.writes.at(-1).body.status!==0)throw Error('editor lost explicit zero');
  await expect(editor).toHaveCount(0);
  console.log(platform+': independent toggles, failure recovery, edit payload, 6 viewport/theme screenshots passed');await context.close();
 }
}finally{await browser.close();}
