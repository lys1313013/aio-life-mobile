const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-platform-fixtures');
const { setup: records } = require('./qa-records-fixtures');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('artifacts/ui-fixes-2026-10-25/special-shots');
fs.mkdirSync(out, { recursive: true });
async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
async function panel(page, name) { const d = page.getByRole('dialog').last(); await expect(d).toBeVisible(); await shot(page, name + '-top'); const scroll = d.locator('.modal-scroll'); if (await scroll.count()) await scroll.evaluate(e => { e.scrollTop = e.scrollHeight; }); await shot(page, name + '-bottom'); }
const providers = [{ id:'9007199254740993',name:'模拟长名称会员平台',code:'fixture',category:'video',iconKey:'fixture',sortOrder:0,isEnabled:1 }];
for (const width of [390,768,1440]) for (const theme of ['light','dark']) {
 const tag = `${width}-${theme}`;
 test(`special admin pages ${tag}`, async ({page}) => {
  await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:theme}); await setup(page,true);
  await page.route('**/api/system/membership-providers**', r => r.fulfill({json:{code:0,data:providers}}));
  await page.route('**/api/membership/provider-icons', r => r.fulfill({json:{code:0,data:Array.from({length:15},(_,i)=>({key:'fixture'+i,name:'模拟图标'+i}))}}));
  await page.goto('/#/pages/admin/membership-providers'); await expect(page.getByRole('button',{name:'编辑平台：'+providers[0].name,exact:true})).toBeVisible(); await shot(page,`providers-list-${tag}`); await page.getByRole('button',{name:'编辑平台：'+providers[0].name,exact:true}).click(); await panel(page,`providers-${tag}`);
  const cover = {id:'9223372036854775807',bankId:'8',name:'模拟已引用卡面',bankName:'模拟银行',fileId:'a'.repeat(32),cardType:'credit',isEnabled:1,sortOrder:0,usageCount:3};
  await page.route('**/api/system/bank-card-covers**', r => r.fulfill({json:{code:0,data:r.request().url().endsWith('/banks')?[{id:'8',name:'模拟银行',enabled:true}]:[cover]}}));
  await page.route('**/api/file/preview/*', r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="605"><rect width="960" height="605" fill="#31567a"/></svg>'}));
  await page.goto('/#/pages/admin/bank-card-covers'); await expect(page.getByRole('button',{name:'编辑'+cover.name,exact:true})).toBeVisible(); await shot(page,`covers-list-${tag}`); await page.getByRole('button',{name:'编辑'+cover.name,exact:true}).click(); await expect(page.getByRole('dialog').locator('uni-picker[aria-label="银行"]')).toHaveAttribute('disabled','true'); await panel(page,`covers-${tag}`); await expect(page.getByRole('dialog').getByRole('button',{name:'保存',exact:true})).toBeVisible(); await expect(page.getByRole('dialog').getByRole('button',{name:'取消',exact:true})).toBeVisible(); for (const label of ['取消','保存']) { const box = await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(901); }
  await page.route('**/api/userDictType/dictTypeEnum',r=>r.fulfill({json:{code:0,data:[{value:'exercise_type',label:'运动分类'}]}})); await page.route('**/api/userDictData/query**',r=>r.fulfill({json:{code:0,data:{items:[{id:'9223372036854775807',dictType:'exercise_type',dictLabel:'模拟长名称分类用于换行与图标预览',dictValue:'run',dictSort:10,status:'0',userId:'6',icon:'lucide:book-open',color:'#3b82f6'}],total:1}}})); await page.goto('/#/pages/records/categories'); await expect(page.getByRole('button',{name:'编辑分类',exact:true}).first()).toBeVisible(); await shot(page,`categories-list-${tag}`); await page.getByRole('button',{name:'编辑分类',exact:true}).first().click(); await panel(page,`categories-${tag}`);
 });
 for (const [key,secrets] of [['footprints.baidu',['serviceAk']],['footprints.tencent',['browserKey','serviceKey']],['typesafe.recommendation',['apiKey']],['mbti.api',['apiKey']]]) test(`special structured ${key} ${tag}`,async({page})=>{
  await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:theme}); await setup(page,true);
  const row={configKey:key,configType:'JSON',description:'模拟 '+key,configValue:JSON.stringify(Object.fromEntries(secrets.map(k=>[k+'Configured',true])))}; const writes=[];
  await page.route('**/api/system-config/**',r=>{ writes.push(JSON.parse(r.request().postDataJSON().configValue)); return r.fulfill({json:{code:0,data:row}}); });
  await page.route('**/api/system-config/list**',r=>r.fulfill({json:{code:0,data:[row]}}));
  await page.goto('/#/pages/admin/index?kind=config'); await expect(page.getByRole('button',{name:'保存配置',exact:true})).toBeVisible();
  await expect(page.locator('input[type=password]').first()).toHaveValue(''); await shot(page,`config-${key}-${tag}`);
  const advanced=page.getByRole('button',{name:'高级设置',exact:true}); if(await advanced.count()){await advanced.click();await shot(page,`config-${key}-advanced-${tag}`);}
  await page.getByRole('button',{name:'保存配置',exact:true}).click(); await expect.poll(()=>writes.length).toBe(1);
  for(const s of secrets){expect(writes[0][s]).toBe('');expect(writes[0]['clear'+s[0].toUpperCase()+s.slice(1)]).toBe(false);}
  await page.getByRole('switch',{name:/^清除/}).first().click(); await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect.poll(()=>writes.length).toBe(2);expect(writes[1]['clear'+secrets[0][0].toUpperCase()+secrets[0].slice(1)]).toBe(true);
 });
 test(`special library import ${tag}`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme}); const state=await records(page);
  await page.goto('/#/pages/records/library?kind=movie');await page.getByRole('button',{name:'豆瓣导入',exact:true}).click();await expect(page.getByText(/选择 douban-exporter/)).toBeVisible();await expect(page.locator('textarea')).toHaveCount(0);await panel(page,`movie-import-${tag}`);
  await page.getByRole('button',{name:'更多方式：JSON 导入',exact:true}).click();await expect(page.getByRole('textbox',{name:'JSON 导入内容',exact:true})).toBeVisible();await panel(page,`movie-import-json-${tag}`);expect(state.writes).toHaveLength(0);
  await page.goto('/#/pages/records/library?kind=read');await page.reload();await expect(page.getByRole('button',{name:'豆瓣导入',exact:true})).toHaveCount(0);
 });
}
