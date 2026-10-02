const {expect}=require('@playwright/test');
const {setup}=require('./qa-domains-fixtures.js');
const fs=require('node:fs'),path=require('node:path');
const entries=[['finance/index','/finance/dashboard','财务总览'],['finance/income','/finance/income','收入'],['finance/expense','/finance/expense','支出'],['finance/import','/finance/import','账单导入'],['finance/cards','/finance/bank-cards','银行卡'],['coding/github','/coding/github','GitHub'],['coding/leetcode','/coding/leetcode','LeetCode'],['coding/csdn','/coding/csdn','CSDN'],['relationship/index','/relationship','关系图谱'],['messages/index','/message','消息中心'],['mcp/index','/mcp/tools','MCP 工具'],['vault/index','/password-manager','密码库']];
async function start(page,routeName,options={}){
 const state=await setup(page);state.readFail=false;state.empty=false;state.person.relationships=[{id:'9223372036854775807',target:{id:'12',name:'模拟朋友'},relationType:'朋友',direction:'双向',description:'保留关系说明',tags:'同学'}];state.requests=[];if(options.existingVault){const {pbkdf2Sync}=require('node:crypto');const {SM4}=require('gm-crypto');const salt='02'.repeat(32),key=pbkdf2Sync('qa-master',Buffer.from(salt,'hex'),100000,16,'sha256').toString('hex');const encrypt=v=>SM4.encrypt(v,key,{mode:'GCM',iv:salt.slice(0,16),inputEncoding:'utf8',outputEncoding:'hex'});state.vaultRow={id:'9223372036854775807',title:'模拟密码',website:'https://example.test',category:'工作',username:encrypt('fixture-user'),password:encrypt('fixture-secret'),remark:encrypt('fixture-remark'),salt,favorite:false};}
 await page.addInitScript(()=>localStorage.removeItem('aio-life-mobile.access-token.v1'));
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname,m=route.request().method();state.requests.push({path:p,method:m});let data;
 if(p==='/api/auth/login')data={accessToken:'qa-domain-fixture'};
 if(p==='/api/quick-nav/candidates')data=entries.map(([r,path,title],i)=>({menuId:String(i+1),path,title,icon:'mdi:circle'}));
 if(p==='/api/menu/preferences')data={menus:[{id:'qa-finance',title:'财务',children:entries.slice(0,5).map((e,i)=>({id:String(i+1),title:e[2]}))},{id:'qa-coding',title:'编程看板',children:entries.slice(5,8).map((e,i)=>({id:String(i+6),title:e[2]}))},...entries.slice(8).map((e,i)=>({id:String(i+9),title:e[2]}))],hiddenMenuIds:[]};
 if(p==='/api/quick-nav/my')data=[];
 if(p==='/api/user/info')data={id:'1',nickname:'模拟用户',roles:['admin']};
 if(p==='/api/password/list')data=state.vaultRow?(options.vaultCount?Array.from({length:options.vaultCount},(_,i)=>({...state.vaultRow,id:String(9220+i),title:['模拟邮件账号','模拟代码托管与长标题账号','模拟学习平台'][i]})):[state.vaultRow]):[];if(state.vaultRow&&p==='/api/password/'+state.vaultRow.id){data=state.vaultRow;if(m==='PUT'){state.calls.push({path:p,body:route.request().postDataJSON()});if(state.fail)return route.fulfill({json:{rscode:'1',result:'模拟保存失败'}});state.vaultRow={...state.vaultRow,...route.request().postDataJSON()};data=state.vaultRow;}}
 if(p==='/api/password/categories')data=['工作'];
 if(p==='/api/income/query')data={items:[{id:'9223372036854775807',amt:100,incTypeId:'81',incDate:'2026-10-01',remark:'模拟收入',tax:8}],total:1};
 if(p==='/api/expense/query')data={items:[{id:'9223372036854775807',amt:70,transactionAmt:99,expTypeId:'81',payTypeId:'82',expTime:'2026-10-01T12:00:00',remark:'模拟支出',transactionNo:'preserve-fixture'}],total:1};
 if(p==='/api/bank-cards/tags')data=[{id:'tag-big-9223372036854775807',name:'模拟标签',color:'#336699',status:'normal'}];
 if(p==='/api/user/2/basic')data={id:'2',nickname:'模拟对方'};
 if(p==='/api/user/1/basic')data={id:'1',nickname:'模拟用户'};
 if(p==='/api/relationships/persons/search')data=[state.person];
 const list=/(query|statisticsByMonth|statisticsByYear|bank-cards$|message\/list$|relationships\/graph$|mcp\/tools$|password\/list$|csdn\/stats$|userbinds\/list$|getByDictType$)/.test(p);
 if(state.readFail&&list)return route.fulfill({json:{rscode:'1',result:'QA 模拟加载失败'}});
 if(state.empty&&list)data=p.endsWith('getByDictType')?{dictDetailList:[]}:p.endsWith('/graph')?{nodes:[],edges:[]}:p.endsWith('/query')?{items:[],total:0}:[];
 if(data!==undefined)return route.fulfill({json:{rscode:'0',data}});
 return route.fallback();});
 await page.goto('/');await page.locator('[aria-label="账号"] input').fill('qa-domain');await page.locator('[aria-label="密码"] input').fill('mock-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('uni-tabbar')).toBeVisible();
 await page.locator('uni-tabbar').getByText('全部',{exact:true}).click();await expect(page.locator('[role=button][aria-label="财务总览"]')).toBeVisible();
 await page.locator('[role=button][aria-label="'+entries.find(e=>e[0]===routeName)[2]+'"]').last().click();await expect(page).toHaveURL(new RegExp('pages/'+routeName));await expect(page.locator('.mobile-button-busy')).toHaveCount(0);await page.waitForLoadState('networkidle');return state;
}
async function shot(page,route,variant,name){const dir=path.resolve('test-results/page-audit/domains');fs.mkdirSync(dir,{recursive:true});const key=route+'-'+variant+'-'+name;page._qaShots=page._qaShots||{};const count=page._qaShots[key]=(page._qaShots[key]||0)+1;const file=path.join(dir,route.replaceAll('/','-')+'-'+variant+'-'+name+(count>1?'-'+count:'')+'.png');await page.screenshot({path:file,fullPage:true});fs.mkdirSync('/tmp/qa-domains-evidence',{recursive:true});fs.copyFileSync(file,path.join('/tmp/qa-domains-evidence',path.basename(file)));return file;}
async function panel(page,route,variant,label,records){const modal=page.locator('[role=dialog][aria-label="'+label+'"]');await expect(modal).toBeVisible();const box=await modal.boundingBox();const size=page.viewportSize();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);records.push(await shot(page,route,variant,label));await modal.locator('.uni-scroll-view').evaluateAll(nodes=>nodes.forEach(n=>n.scrollTop=n.scrollHeight));records.push(await shot(page,route,variant,label+'-bottom'));await inspectPickers(page,modal,route,variant+'-'+label,records);return modal;}
async function close(page){await page.locator('[role=dialog]').last().locator('[role=button][aria-label="关闭"]').click();}
async function picker(page,label,choice){
 const field=page.locator('uni-picker[aria-label="'+label+'"]').last();const current=(await field.locator('.form-field-input').innerText()).trim();await field.click();
 await page.waitForTimeout(400);const wheel=page.locator('uni-picker-view.uni-picker-content').last();
 if(await page.locator('uni-picker-view.uni-picker-content .uni-picker-view-indicator:visible').count()){
 const items=await wheel.locator('.uni-picker-item').allTextContents();const from=Math.max(0,items.indexOf(current)),to=items.indexOf(choice);if(to<0)throw new Error('Missing picker option '+choice);
 await wheel.locator('.uni-picker-view-group').hover();for(let i=0;i<Math.abs(to-from);i++){await page.mouse.wheel(0,to>from?34:-34);await page.waitForTimeout(150)}await page.waitForTimeout(350);
 const route=page.url().split('/pages/')[1].split('?')[0];await shot(page,route,page.viewportSize().width+'-'+(await page.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')),label+'-picker');
 await page.locator('.uni-picker-action-confirm:visible').last().click();
 }else{await page.locator('.uni-picker-select .uni-picker-item:visible').getByText(choice,{exact:true}).first().click();}
 await expect(field.locator('.form-field-input')).toHaveText(choice);
}
async function inspectPickers(page,scope,route,variant,records){const fields=scope.locator('uni-picker');for(let i=0;i<await fields.count();i++){const field=fields.nth(i);if(await field.getAttribute('disabled')!==null)continue;const label=await field.getAttribute('aria-label')||'picker'+i;await field.click();await page.waitForTimeout(250);records.push(await shot(page,route,variant,label+'-overlay'));if(await field.locator('input[type=date],input[type=time]').count()){await page.keyboard.press('Escape');await page.waitForTimeout(150);continue}const cancel=page.locator('.uni-picker-action-cancel:visible');if(await cancel.count())await cancel.last().click();else{const mask=page.locator('.uni-picker-mask:visible');if(await mask.count())await mask.last().click({position:{x:5,y:5}});else await page.keyboard.press('Escape')}await page.waitForTimeout(450)}}
module.exports={start,shot,panel,close,picker,entries,inspectPickers};
