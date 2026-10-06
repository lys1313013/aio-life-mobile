const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const out = 'artifacts/dict-types-c';
fs.mkdirSync(out, { recursive: true });
const row = i => ({dictId:String(9223372036854775000n+BigInt(i)),dictName:['设备状态','设备类型','支出类型','收入类型','银行','模拟很长的字典名称'][(i-1)%6],dictType:['device_status','device_type','expense_type','income_type','bank','fixture_very_long_dictionary_identifier'][(i-1)%6],remark:i===1?'用于验证备注换行和信息密度的模拟说明。':'',updateTime:i===2?null:'2026-10-05 10:20:30'});
async function setup(page) {
  const state = { requests:[], failMore:false, delay:0, emptyMore:false, writes:[], changes:[], failWrite:false, deleted:[] };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1',JSON.stringify({type:'string',data:'dict-types-fixture'})));
  await page.route('**/api/user/info',r=>r.fulfill({json:{code:0,data:{id:'9001',roles:['admin']}}}));
  await page.route('**/api/auth/secondary-lock/menus',r=>r.fulfill({json:{code:0,data:[]}}));
  await page.route('**/api/sysDictType/query?*',async r=>{
    const q=Object.fromEntries(new URL(r.request().url()).searchParams); state.requests.push(q);
    const delay=state.delay; if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    if(q.page==='2' && state.failMore) return r.fulfill({json:{code:1,message:'模拟分页失败'}});

    const items=q.dictName ? (q.dictName==='不存在'?[]:[{...row(1),dictName:q.dictName}]) : q.page==='1'?Array.from({length:20},(_,i)=>row(i+1)):state.emptyMore?[]:[row(20),row(21),row(22)];
    await r.fulfill({json:{code:0,data:{items:items.filter(item=>!state.deleted.includes(item.dictId)),total:q.dictName?items.length:22-state.deleted.length}}});
  });
  await page.route('**/api/sysDictType',r=>{state.writes.push(r.request().postDataJSON());return r.fulfill({json:{code:0,data:true}})});
  await page.route(/\/api\/sysDictType\/\d+$/, r=>{
    const request=r.request(), id=new URL(request.url()).pathname.split('/').at(-1);
    state.changes.push({method:request.method(),id,body:request.postDataJSON()});
    if(state.failWrite)return r.fulfill({json:{code:1,message:'模拟删除失败'}});
    if(request.method()==='DELETE')state.deleted.push(id);
    return r.fulfill({json:{code:0,data:true}});
  });
  await page.goto('/#/pages/admin/index?kind=dict-types');
  await expect(page.locator('.dict-row')).toHaveCount(20);
  return state;
}
async function bottom(page) {
  const scroller=page.locator('.mobile-page-scroll .uni-scroll-view').last();
  // uni-app H5 的首次 scrolltolower 有 200ms 节流，避免在页面初始化窗口内滚到底。
  await expect.poll(() => page.evaluate(() => performance.now())).toBeGreaterThan(200);
  await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight});
}
test('搜索即时查询、旧请求隔离、重置及新增',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await setup(page);
  const search=page.getByRole('textbox',{name:'字典名称',exact:true});
  state.delay=1000;
  await search.fill('旧查询');
  await expect.poll(()=>state.requests.at(-1).dictName).toBe('旧查询');
  state.delay=0;
  await search.fill('设备');
  await expect(page.locator('.dict-row .dict-title')).toHaveText(['设备']);
  await page.waitForTimeout(1100);
  await expect(page.locator('.dict-row .dict-title')).toHaveText(['设备']);
  expect(state.requests.at(-1)).toMatchObject({dictName:'设备',page:'1'});
  await search.fill('不存在');
  await expect(page.getByText('没有匹配的字典类型',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'重置筛选',exact:true}).click();
  await expect(page.locator('.dict-row')).toHaveCount(20);
  await page.getByRole('button',{name:'新增',exact:true}).click();
  const modal=page.getByRole('dialog');
  await modal.getByRole('textbox',{name:'字典名称',exact:true}).fill('模拟新增');
  await modal.getByRole('textbox',{name:'字典标识',exact:true}).fill('fixture_new');
  await modal.getByRole('button',{name:'保存',exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({dictName:'模拟新增',dictType:'fixture_new'});
});
test('实际触底、请求去重、失败重试、跨页去重和末页停止',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await setup(page); state.failMore=true;
  await bottom(page);
  await expect(page.getByText('模拟分页失败',{exact:true})).toBeVisible();
  await expect(page.locator('.dict-row')).toHaveCount(20);
  expect(state.requests.filter(q=>q.page==='2')).toHaveLength(1);
  state.failMore=false;state.delay=200;
  await page.getByRole('button',{name:'重试加载',exact:true}).click();
  await bottom(page);
  await expect(page.locator('.dict-row')).toHaveCount(22);
  expect(state.requests.filter(q=>q.page==='2')).toHaveLength(2);
  await bottom(page);await page.waitForTimeout(350);
  expect(state.requests.some(q=>q.page==='3')).toBe(false);
});
test('空分页后停止请求',async({page})=>{
  const state=await setup(page);state.emptyMore=true;
  await bottom(page);
  await expect.poll(()=>state.requests.length).toBe(2);
  await page.waitForTimeout(200);await bottom(page);await page.waitForTimeout(200);
  expect(state.requests.length).toBe(2);
  await expect(page.locator('.dict-row')).toHaveCount(20);
});
for(const width of [390,820,1440]) for(const dark of [false,true]) test(`布局 ${width} ${dark?'dark':'light'}`,async({page})=>{
  await page.setViewportSize({width,height:960});
  await page.addInitScript(dark=>localStorage.setItem('aio-life-mobile.theme.v1',JSON.stringify({type:'string',data:dark?'dark':'light'})),dark);
  await setup(page);
  await expect(page.locator('.dict-row .dict-title').first()).toBeVisible();
  const height = await page.locator('.dict-row').first().evaluate(el=>el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
  expect(height).toBeLessThanOrEqual(46);
  await expect(page.locator('.dict-row').first().getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);
  await expect(page.locator('.dict-row').first().getByRole('button',{name:'删除',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${out}/${width}-${dark?'dark':'light'}.png`});
  await page.locator('.dict-row').first().getByRole('button',{name:/更多操作$/}).click();
  await expect(page.getByRole('dialog',{name:'字典类型操作'})).toBeVisible();
  await page.screenshot({path:`${out}/${width}-${dark?'dark':'light'}-actions.png`});
  await page.getByRole('dialog').getByRole('button',{name:'编辑',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:`${out}/${width}-${dark?'dark':'light'}-edit.png`});
});

test('单行详情保留完整信息，更多菜单编辑及删除失败恢复',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await setup(page);
  const first=page.locator('.dict-row').first();
  await first.locator('.dict-row-content').click();
  const detail=page.getByRole('dialog',{name:'字典类型详情'});
  await expect(detail).toContainText('device_status');
  await expect(detail).toContainText('用于验证备注换行和信息密度的模拟说明。');
  await expect(detail).toContainText('2026-10-05 10:20:30');
  await page.screenshot({path:`${out}/390-light-details.png`});
  await detail.getByRole('button',{name:'关闭',exact:true}).click();
  await first.getByRole('button',{name:/更多操作$/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'编辑',exact:true}).click();
  const editor=page.getByRole('dialog');
  await editor.getByRole('textbox',{name:'字典名称',exact:true}).fill('模拟修改');
  await editor.getByRole('button',{name:'保存',exact:true}).click();
  await expect.poll(()=>state.changes.length).toBe(1);
  expect(state.changes[0]).toMatchObject({method:'PUT',id:row(1).dictId,body:{dictName:'模拟修改',dictType:'device_status'}});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'查询',exact:true})).toBeEnabled();
  await first.getByRole('button',{name:/更多操作$/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'删除',exact:true}).click();
  const confirm=page.getByRole('dialog').last();
  await expect(confirm).toContainText('确定删除');
  state.failWrite=true;
  await confirm.getByRole('button',{name:'确认',exact:true}).click();
  await expect(confirm).toContainText('模拟删除失败');
  await expect(page.locator('.dict-row')).toHaveCount(20);
  state.failWrite=false;
  await confirm.getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.dict-row .dict-title').first()).toHaveText('设备类型');
  expect(state.changes.filter(item=>item.method==='DELETE').map(item=>item.id)).toEqual([row(1).dictId,row(1).dictId]);
});

for (const dark of [false,true]) test(`分页等待时名称保持可读 ${dark?'dark':'light'}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(dark=>localStorage.setItem('aio-life-mobile.theme.v1',JSON.stringify({type:'string',data:dark?'dark':'light'})),dark);
  const state=await setup(page);
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  await page.route('**/api/sysDictType/query?*',async route=>{
    const q=new URL(route.request().url()).searchParams;
    if(q.get('page')==='2')await pending;
    await route.fallback();
  });
  const before=await page.locator('.dict-row .dict-title').last().evaluate(el=>({text:el.textContent,color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.dict-row-content')).backgroundColor}));
  try {
    await bottom(page);
    await expect(page.locator('.dict-row-content').last()).toHaveAttribute('disabled','true');
    const during=await page.locator('.dict-row .dict-title').last().evaluate(el=>({text:el.textContent,color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.dict-row-content')).backgroundColor}));
    fs.writeFileSync(`${out}/pagination-${dark?'dark':'light'}.json`,JSON.stringify({before,during},null,2));
    await page.screenshot({path:`${out}/pagination-${dark?'dark':'light'}.png`});
    expect(during).toEqual(before);
  } finally { release(); }
  await expect(page.locator('.dict-row')).toHaveCount(22);
  expect(state.requests.filter(q=>q.page==='2')).toHaveLength(1);
});

test('排序设置按标识升降序排列已加载数据',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await setup(page);
  await page.getByRole('button',{name:'排序设置',exact:true}).click();
  await page.locator('uni-picker[aria-label="已加载数据排序"]').click();
  await page.locator('.uni-picker-select:visible').getByText('标识',{exact:true}).click();
  await expect(page.locator('.dict-row .dict-value').first()).toHaveText('bank');
  await page.getByRole('button',{name:'升序',exact:true}).click();
  await expect(page.locator('.dict-row .dict-value').first()).toHaveText('income_type');
  await page.getByRole('button',{name:'排序设置',exact:true}).click();
  await expect(page.locator('uni-picker[aria-label="已加载数据排序"]')).toHaveCount(0);
});
