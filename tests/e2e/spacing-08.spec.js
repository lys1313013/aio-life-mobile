const { dismissModal } = require('./modal');
const {test,expect}=require('@playwright/test');
const {setup,id}=require('./qa-records-fixtures');
const fs=require('fs');
const dir='artifacts/spacing-audit/08';fs.mkdirSync(dir,{recursive:true});
const entries=[{menuId:'devices',path:'/record/device',title:'设备'},{menuId:'wardrobe',path:'/wardrobe',title:'衣柜'},{menuId:'member',path:'/membership',title:'会员'}];
for(const title of ['设备','衣柜','会员'])for(const [width,theme]of [[390,'light'],[390,'dark'],[768,'light'],...(title==='设备'?[[1440,'light']]:[])])test(`${title} ${width} ${theme}`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});const errors=[];page.on('pageerror',e=>errors.push(e.message));const state=await setup(page);
 state.devices=[...Array(4)].map((_,i)=>({...state.devices[0],id:i?String(92230+i):id,name:i?'备用设备 '+i:'模拟设备',spec:'笔记本电脑 · 16GB 内存 / 512GB 固态硬盘',remark:'日常学习与项目开发使用，定期备份资料。'}));state.members=[...Array(3)].map((_,i)=>({...state.members[0],id:i?String(92240+i):id,note:'按月续费，用于家庭娱乐与学习。'}));
 await page.route('**/api/wardrobe/items',r=>r.fulfill({json:{rscode:'0',data:[...Array(4)].map((_,i)=>({id:i?String(92250+i):id,name:i?'春秋衣物 '+i:'模拟衣物',categoryId:'81',season:'春,秋',price:100,color:'深蓝',brand:'模拟品牌',size:'M',memo:'通勤穿着，多行衣物信息与卡片密度验收'}))}}));
 await page.route('**/api/quick-nav/candidates',r=>r.fulfill({json:{rscode:'0',data:entries}}));await page.route('**/api/menu/preferences',r=>r.fulfill({json:{rscode:'0',data:{menus:entries.map(e=>({id:e.menuId,title:e.title,children:[]})),hiddenMenuIds:[]}}}));
 await page.locator('uni-tabbar').getByText('全部',{exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await page.waitForTimeout(350);
 const prefix= `${dir}/${title}-${width}-${theme}`,evidence=[];async function shot(label){let file=prefix+'-'+label+'.png';await page.screenshot({path:file});evidence.push(file);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await shot('page');const geometry=await page.evaluate(()=>{const root=document.querySelector('.ui-page-body'),card=document.querySelector('.goods-card,.member-card,.item-card'),toolbar=document.querySelector('.ui-toolbar'),filter=document.querySelector('.ui-field-row');let css=n=>n?{rect:n.getBoundingClientRect().toJSON(),padding:getComputedStyle(n).padding,gap:getComputedStyle(n).gap,marginBottom:getComputedStyle(n).marginBottom}:null;return{root:css(root),card:css(card),toolbar:css(toolbar),filter:css(filter),buttons:[...document.querySelectorAll('[role=button]')].filter(n=>n.getBoundingClientRect().width).map(n=>({label:n.getAttribute('aria-label'),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),fields:filter?[...filter.children].map(css):[]}});for(const b of geometry.buttons){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44)}expect(geometry.card.padding).toBe('12px');expect(geometry.card.gap).toBe(title==='会员'?'12px':'8px');expect(geometry.root.rect.x).toBe(width===1440?252:12);
 if(geometry.toolbar)expect(geometry.toolbar.gap).toBe('8px');if(geometry.fields.length===2)expect(Math.abs(geometry.fields[0].rect.width-geometry.fields[1].rect.width)).toBeLessThan(1);
 const labels=title==='设备'?['新增设备','编辑设备','删除设备']:title==='会员'?['新增订阅','编辑订阅：模拟会员','删除订阅']:['新增衣物','编辑衣物模拟衣物','删除衣物模拟衣物'];
 for (const label of labels) {
   const nestedDelete = label === '删除设备' || label === '删除订阅';
   if (nestedDelete) {
     const editor = label === '删除设备' ? '编辑设备' : '编辑订阅：模拟会员';
     await page.getByRole('button', { name: editor, exact: true }).first().click();
   }
   await page.getByRole('button', { name: label, exact: true }).first().click();
   const dialog = page.getByRole('dialog').last();
   await expect(dialog).toBeVisible();
   await shot(label + '-top');
   if (!label.startsWith('删除')) {
     await dialog.getByRole('button').last().scrollIntoViewIfNeeded();
     await shot(label + '-bottom');
   }
   const cancel = dialog.getByRole('button', { name: '取消', exact: true });
   if (await cancel.count()) await cancel.click();
   else await dismissModal(page);
   if (nestedDelete) await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.waitForTimeout(180);
 }
 if(title==='衣柜'){await page.getByRole('button',{name:'分类',exact:true}).click();await shot('categories');for(const label of ['新增衣柜分类','编辑分类模拟衣柜分类','删除分类模拟衣柜分类']){await page.getByRole('button',{name:label,exact:true}).click();const dialog=page.getByRole('dialog').last();await expect(dialog).toBeVisible();await shot(label);const cancel=dialog.getByRole('button',{name:'取消',exact:true});if(await cancel.count())await cancel.click();else await dismissModal(page);await page.waitForTimeout(180)}}
 expect(errors).toEqual([]);fs.writeFileSync(prefix+'.json',JSON.stringify({geometry,evidence,errors,scope:'H5 mocked API real life navigation clicks'},null,2));
});
