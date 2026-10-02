// 模拟接口Web专项：node tests/admin-web.mjs；不接真实后端。
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=createRequire(import.meta.url)('@playwright/test'),browser=await chromium.launch({channel:'chrome',headless:true}),output=new URL('../test-results/admin/',import.meta.url).pathname
await mkdir(output,{recursive:true});const id='9223372036854775807'
async function setup(viewport,theme='light'){
 const context=await browser.newContext({viewport});await context.addInitScript(theme=>{localStorage.setItem('aio-life-mobile.access-token.v1','synthetic-token');localStorage.setItem('aio-life-mobile.theme.v1',theme)},theme)
 const page=await context.newPage(),state={fail:false,status:200,writes:[],category:{id,userId:'7',parentId:'0',name:'长ID分类',color:'#427bea',icon:'lucide:book',description:'保留描述',timeType:2,isTrackTime:1,isEnabled:1,sort:0},menu:{id,parentId:'0',name:'Synthetic',path:'/synthetic',meta:{title:'模拟菜单',icon:'lucide:book',keepAlive:true,fixtureExtra:{keep:true}},status:1,sort:0,roles:'admin'}}
 await page.route('http://127.0.0.1:5180/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data=[]
 if(path==='/api/user/info')data={id:'7',username:'fixture',nickname:'模拟用户',roles:['admin']}
 if(path==='/api/timeTrackerCategory/list')data=[state.category]
 if(path==='/api/menu/admin/tree')data=[state.menu]
 if(path==='/api/menu/admin/role-options')data=['admin','user']
 if((path==='/api/timeTrackerCategory'||path==='/api/menu/admin/'+id)&&method==='PUT'){const body=req.postDataJSON();state.writes.push({path,method,body});if(state.fail)return route.fulfill({json:{rscode:'1',result:'模拟保存失败'}});if(path.includes('timeTrackerCategory'))state.category={...state.category,...body};else state.menu={...state.menu,...body};data=true}
 if(state.status!==200&&['/api/menu/admin/tree','/api/timeTrackerCategory/list'].includes(path))return route.fulfill({status:state.status,json:{rscode:'1',result:state.status===403?'模拟权限拒绝':'登录已过期'}})
 return route.fulfill({json:{rscode:'0',data}})})
 return {context,page,state}
}
try{
 for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}])for(const theme of ['light','dark']){
 const {context,page,state}=await setup(viewport,theme);await page.goto('http://127.0.0.1:5180/#/pages/categories/index');await page.getByText('长ID分类',{exact:true}).waitFor();await page.getByRole('button',{name:'编辑分类',exact:true}).click();const dialog=page.getByRole('dialog',{name:'编辑分类',exact:true});await dialog.getByRole('textbox',{name:'分类名称',exact:true}).fill('修改分类');state.fail=true;await dialog.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('模拟保存失败',{exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:'分类名称',exact:true}).inputValue(),'修改分类');assert.equal(state.writes.at(-1).body.id,id);assert.equal(state.writes.at(-1).body.description,'保留描述');assert.equal(state.writes.at(-1).body.timeType,2);await page.screenshot({path:output+viewport.width+'-'+theme+'-category.png',fullPage:true});state.fail=false;await dialog.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('修改分类',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await context.close();console.log('分类 '+viewport.width+' '+theme+' 编辑失败保留/长ID通过')}
 const {context,page,state}=await setup({width:390,height:844});await page.goto('http://127.0.0.1:5180/#/pages/admin/index?kind=menus');await page.getByRole('button',{name:'编辑模拟菜单',exact:true}).click();const dialog=page.getByRole('dialog',{name:'菜单管理',exact:true});await dialog.getByRole('textbox',{name:'菜单名称',exact:true}).fill('修改菜单');await dialog.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('修改菜单',{exact:true}).first().waitFor();assert.equal(state.writes.at(-1).body.id,id);assert.deepEqual(state.writes.at(-1).body.meta.fixtureExtra,{keep:true});assert.equal(state.writes.at(-1).body.meta.keepAlive,true);state.status=403;await page.reload();await page.getByText('模拟权限拒绝',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('aio-life-mobile.access-token.v1')),'synthetic-token');state.status=401;await page.reload();await page.waitForURL('**/#/pages/login/index');assert.ok(!await page.evaluate(()=>localStorage.getItem('aio-life-mobile.access-token.v1')));await context.close();console.log('菜单meta/403保留登录/401统一跳转通过')
}finally{await browser.close()}
