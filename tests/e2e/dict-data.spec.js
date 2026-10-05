const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const out = 'artifacts/dict-data-a';
fs.mkdirSync(out, { recursive: true });
const row = (i, type = 'bank') => ({dictCode: String(9223372036854775000n + BigInt(i)), dictId:type === 'bank'?'91':'92', dictLabel: type === 'bank' ? '模拟银行 ' + i : '模拟设备状态 ' + i, dictValue:'CODE_' + i, dictType:type, dictName:type === 'bank'?'银行':'设备状态', dictSort:i, status:i % 2 ? '0':'1', remark:i === 1?'用于验证备注换行和信息密度的模拟说明。':'', updateTime:'2026-10-05 10:20:30'});
async function setup(page) {
  const state = { requests:[], failMore:false, delay:0, emptyMore:false, writes:[], changes:[], failWrite:false, deleted:[] };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1',JSON.stringify({type:'string',data:'dict-data-fixture'})));
  await page.route('**/api/user/info',r=>r.fulfill({json:{rscode:'0',data:{id:'9001',roles:['admin']}}}));
  await page.route('**/api/auth/secondary-lock/menus',r=>r.fulfill({json:{rscode:'0',data:[]}}));
  await page.route('**/api/sysDictType/query?*',r=>r.fulfill({json:{rscode:'0',data:{items:[{dictId:'91',dictName:'银行',dictType:'bank'},{dictId:'92',dictName:'设备状态',dictType:'device_status'}],total:'2'}}}));
  await page.route('**/api/sysDictData/query?*',async r=>{
    const q=Object.fromEntries(new URL(r.request().url()).searchParams); state.requests.push(q);
    const delay=state.delay; if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    if(q.page==='2' && state.failMore) return r.fulfill({json:{rscode:'1',result:'模拟分页失败'}});
    const type=q.dictType||'device_status';
    const items=q.dictLabel ? (q.dictLabel==='不存在'?[]:[row(1,type)]) : q.page==='1'?Array.from({length:20},(_,i)=>row(i+1,type)):state.emptyMore?[]:[row(20,type),row(21,type),row(22,type)];
    await r.fulfill({json:{rscode:'0',data:{items:items.filter(item=>!state.deleted.includes(item.dictCode)),total:q.dictLabel?String(items.length):String(22-state.deleted.length)}}});
  });
  await page.route('**/api/sysDictData',r=>{state.writes.push(r.request().postDataJSON());return r.fulfill({json:{rscode:'0',data:true}})});
  await page.route(/\/api\/sysDictData\/\d+$/, r=>{
    const request=r.request(), id=new URL(request.url()).pathname.split('/').at(-1);
    state.changes.push({method:request.method(),id,body:request.postDataJSON()});
    if(state.failWrite)return r.fulfill({json:{rscode:'1',result:'模拟删除失败'}});
    if(request.method()==='DELETE')state.deleted.push(id);
    return r.fulfill({json:{rscode:'0',data:true}});
  });
  await page.goto('/#/pages/admin/index?kind=dict-data');
  await expect(page.locator('.dict-row')).toHaveCount(20);
  return state;
}
async function pick(page, label, value) {
  const picker = page.locator(`uni-picker[aria-label="${label}"]`);
  const labels = ['全部类型', '银行 · bank', '设备状态 · device_status'];
  const current = (await picker.innerText()).replace(/[·\s]/g,'');
  const previous = labels.findIndex(label => label.replace(/[·\s]/g,'') === current);
  await picker.click();
  if (await page.locator('.uni-picker-select:visible').count()) {
    await page.locator('.uni-picker-select:visible').getByText(value,{exact:true}).click();
  } else {
    await page.waitForTimeout(350);
    const box = await page.locator('.uni-picker-view-indicator').boundingBox();
    const x=box.x+box.width/2, y=box.y+box.height/2;
    const delta=labels.indexOf(value)-previous;
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-box.height*delta*i/8}]});
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(200);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(350);
    await page.locator('.uni-picker-action-confirm:visible').click();
    await cdp.detach();
  }
}
async function bottom(page) {
  const scroller=page.locator('.mobile-page-scroll .uni-scroll-view').last();
  // uni-app H5 的首次 scrolltolower 有 200ms 节流，避免在页面初始化窗口内滚到底。
  await expect.poll(() => page.evaluate(() => performance.now())).toBeGreaterThan(200);
  await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight});
}
test('类型即时筛选、搜索、旧请求隔离、重置、新增默认类型',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const state=await setup(page);
  state.delay=2500;
  await pick(page,'字典类型筛选','银行 · bank');
  await expect.poll(()=>state.requests.at(-1).dictType).toBe('bank');
  state.delay=0;
  await pick(page,'字典类型筛选','设备状态 · device_status');
  await expect(page.locator('.dict-title').first()).toHaveText('模拟设备状态 1');
  await page.waitForTimeout(2600);
  await expect(page.locator('.dict-title').first()).toHaveText('模拟设备状态 1');
  await pick(page,'字典类型筛选','银行 · bank');
  await expect(page.locator('.dict-title').first()).toHaveText('模拟银行 1');
  await page.getByRole('textbox',{name:'展示值',exact:true}).fill('不存在');
  await expect(page.getByText('没有匹配的字典数据',{exact:true})).toBeVisible();
  expect(state.requests.at(-1)).toMatchObject({dictType:'bank',dictLabel:'不存在',page:'1'});
  await page.getByRole('button',{name:'重置筛选',exact:true}).click();
  await expect(page.locator('.dict-row')).toHaveCount(20);
  expect(state.requests.at(-1)).toEqual({page:'1',pageSize:'20'});
  await pick(page,'字典类型筛选','银行 · bank');
  await expect(page.locator('.dict-title').first()).toHaveText('模拟银行 1');
  await expect(page.locator('.dict-group')).toHaveCount(0);
  await expect(page.locator('.uni-picker-action-confirm:visible')).toHaveCount(0);
  await page.screenshot({path:`${out}/390-light-bank.png`});
  await page.getByRole('button',{name:'新增',exact:true}).click();
  const modal=page.getByRole('dialog');
  await expect(modal.locator('uni-picker[aria-label="字典类型"]')).toContainText('银行');
  await modal.getByRole('textbox',{name:'实际值',exact:true}).fill('TEST');
  await modal.getByRole('textbox',{name:'展示值',exact:true}).fill('模拟新增');
  await modal.getByRole('button',{name:'保存',exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0].dictId).toBe('91');
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
  await expect(page.locator('.dict-title').first()).toBeVisible();
  const height = await page.locator('.dict-row').first().evaluate(el=>el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
  expect(height).toBeLessThanOrEqual(46);
  await expect(page.locator('.dict-row').first().getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);
  await expect(page.locator('.dict-row').first().getByRole('button',{name:'删除',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${out}/${width}-${dark?'dark':'light'}.png`});
  await page.locator('.dict-row').first().getByRole('button',{name:/更多操作$/}).click();
  await expect(page.getByRole('dialog',{name:'字典操作'})).toBeVisible();
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
  const detail=page.getByRole('dialog',{name:'字典详情'});
  await expect(detail).toContainText('CODE_1');
  await expect(detail).toContainText('用于验证备注换行和信息密度的模拟说明。');
  await expect(detail).toContainText('2026-10-05 10:20:30');
  await page.screenshot({path:`${out}/390-light-details.png`});
  await detail.getByRole('button',{name:'关闭',exact:true}).click();
  await first.getByRole('button',{name:/更多操作$/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'编辑',exact:true}).click();
  const editor=page.getByRole('dialog');
  await editor.getByRole('textbox',{name:'展示值',exact:true}).fill('模拟修改');
  await editor.getByRole('button',{name:'保存',exact:true}).click();
  await expect.poll(()=>state.changes.length).toBe(1);
  expect(state.changes[0]).toMatchObject({method:'PUT',id:row(1).dictCode,body:{dictLabel:'模拟修改',dictId:'92'}});
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
  await expect(page.locator('.dict-title').first()).toHaveText('模拟设备状态 2');
  expect(state.changes.filter(item=>item.method==='DELETE').map(item=>item.id)).toEqual([row(1).dictCode,row(1).dictCode]);
});

for (const dark of [false,true]) test(`分页等待时名称保持可读 ${dark?'dark':'light'}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(dark=>localStorage.setItem('aio-life-mobile.theme.v1',JSON.stringify({type:'string',data:dark?'dark':'light'})),dark);
  const state=await setup(page);
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  await page.route('**/api/sysDictData/query?*',async route=>{
    const q=new URL(route.request().url()).searchParams;
    if(q.get('page')==='2')await pending;
    await route.fallback();
  });
  const before=await page.locator('.dict-title').last().evaluate(el=>({text:el.textContent,color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.dict-row-content')).backgroundColor}));
  try {
    await bottom(page);
    await expect(page.locator('.dict-row-content').last()).toHaveAttribute('disabled','true');
    const during=await page.locator('.dict-title').last().evaluate(el=>({text:el.textContent,color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.dict-row-content')).backgroundColor}));
    fs.writeFileSync(`${out}/pagination-${dark?'dark':'light'}.json`,JSON.stringify({before,during},null,2));
    await page.screenshot({path:`${out}/pagination-${dark?'dark':'light'}.png`});
    expect(during).toEqual(before);
  } finally { release(); }
  await expect(page.locator('.dict-row')).toHaveCount(22);
  expect(state.requests.filter(q=>q.page==='2')).toHaveLength(1);
});
