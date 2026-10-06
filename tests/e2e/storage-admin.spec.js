const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const file = (key, extra={}) => ({key,directory:false,size:'10240',lastModified:'2026-10-03T02:30:00Z',previewable:false,...extra});
const directory = key => file(key,{directory:true,size:'0',lastModified:null});
const result = (items,nextCursor=null,prefix='') => ({code:0,data:{bucket:'demo-life-files',prefix,items,nextCursor}});
const gate = () => {let release;const promise=new Promise(resolve=>release=resolve);return {promise,release}};
async function setup(page,theme='light',admin=true) {
  await page.addInitScript(({theme})=>{localStorage.setItem('aio-life-mobile.access-token.v1','storage-fixture');localStorage.setItem('aio-life-mobile.theme.v1',theme)},{theme});
  await page.route('**/api/user/info',route=>route.fulfill({json:{code:0,data:{id:'1',accountUsername:'fixture',nickname:'模拟管理员',roles:admin?['admin']:['user']}}}));
  await page.route('**/api/auth/secondary-lock/menus',route=>route.fulfill({json:{code:0,data:[]}}));
  await page.route('**/api/system/storage/preview?**',route=>route.fulfill({contentType:'image/png',body:image}));
}
async function scrollBottom(page) {
  const scroll=page.locator('.mobile-page-scroll .uni-scroll-view[style]').first();
  await page.locator('.mobile-page-scroll').hover();await page.waitForTimeout(220);
  const bottom=await scroll.evaluate(el=>el.scrollHeight-el.clientHeight);
  await page.mouse.wheel(0,100000);await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThanOrEqual(bottom-1);
}
async function away(page) {
  await page.locator('.mobile-page-scroll').hover();await page.mouse.wheel(0,-600);
  await expect.poll(()=>page.locator('.mobile-page-scroll .uni-scroll-view[style]').first().evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeGreaterThan(100);
}
test.afterEach(async({page})=>page.unrouteAll({behavior:'ignoreErrors'}));

test('对象存储实际滚动加载、游标去重、失败恢复和空末页停止',async({page})=>{
  await page.setViewportSize({width:390,height:850});await setup(page);
  const requests=[],pending=gate();let fail=true;
  await page.route('**/api/system/storage/objects?**',async route=>{
    const cursor=new URL(route.request().url()).searchParams.get('cursor');requests.push(cursor);
    if(!cursor)return route.fulfill({json:result(Array.from({length:24},(_,i)=>file('模拟文件-'+i+'.txt')),'next&cursor')});
    if(fail)return route.fulfill({json:{code:1,message:'模拟分页失败'}});
    await pending.promise;await route.fulfill({json:result([], 'erroneous-next')});
  });
  await page.goto('/#/pages/admin/storage');await expect(page.locator('.storage-card')).toHaveCount(24);
  await scrollBottom(page);await expect(page.locator('.load-more-error')).toContainText('模拟分页失败');
  await expect(page.locator('.storage-card')).toHaveCount(24);await away(page);await scrollBottom(page);expect(requests).toEqual([null,'next&cursor']);
  fail=false;await page.getByRole('button',{name:'重试加载',exact:true}).click();await expect(page.getByRole('status',{name:'正在加载更多',exact:true})).toBeVisible();
  await away(page);await scrollBottom(page);expect(requests).toEqual([null,'next&cursor','next&cursor']);
  pending.release();await expect(page.locator('.load-more')).toHaveCount(0);await away(page);await scrollBottom(page);expect(requests).toHaveLength(3);
  await expect(page.getByRole('button',{name:/继续加载|加载更多|下一页/})).toHaveCount(0);
});

test('对象存储切目录忽略旧分页，面包屑恢复根路径',async({page})=>{
  await page.setViewportSize({width:390,height:850});await setup(page);
  const pending=gate();let oldRequested=false;
  await page.route('**/api/system/storage/objects?**',async route=>{
    const url=new URL(route.request().url()),prefix=url.searchParams.get('prefix')||'';
    if(prefix==='images/')return route.fulfill({json:result([file('images/new.png')],null,prefix)});
    if(url.searchParams.get('cursor')){oldRequested=true;await pending.promise;return route.fulfill({json:result([file('old-page.txt')])});}
    await route.fulfill({json:result([directory('images/'),...Array.from({length:23},(_,i)=>file('文件-'+i+'.txt'))],'next')});
  });
  await page.goto('/#/pages/admin/storage');await expect(page.locator('.storage-card')).toHaveCount(24);await scrollBottom(page);await expect.poll(()=>oldRequested).toBe(true);
  await page.getByRole('button',{name:'打开目录 images/',exact:true}).first().click();await expect(page.locator('.storage-card')).toHaveCount(1);
  pending.release();await expect(page.getByText('new.png',{exact:true})).toBeVisible();await expect(page.getByText('old-page.txt',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'根目录',exact:true}).click();await expect(page.locator('.storage-card')).toHaveCount(24);
});

for(const width of [390,768,1440])for(const theme of ['light','dark']) {
  test(`对象存储浏览、预览下载和删除保护 ${width} ${theme}`,async({page})=>{
    await page.setViewportSize({width,height:900});await setup(page,theme);
    const keys=['年度账单-2026-家庭支出明细与票据归档.pdf','中文 空格&特殊字符#.png'];
    let rows=[directory('avatars/'),file(keys[1],{previewable:true}),file(keys[0]),file('backup/2026-10-03-personal-records.json')],blockDelete=true;
    await page.route('**/api/system/storage/objects?**',route=>route.fulfill({json:result(rows)}));
    await page.route('**/api/system/storage/download?**',route=>{
      expect(route.request().headers().authorization).toBe('Bearer storage-fixture');
      return route.fulfill({contentType:'application/octet-stream',body:'demo download'});
    });
    await page.route('**/api/system/storage/object?**',route=>{
      expect(route.request().method()).toBe('DELETE');
      if(blockDelete)return route.fulfill({status:409,json:{code:1,message:'文件仍被业务记录引用，不能删除'}});
      rows=rows.filter(row=>row.key!==keys[0]);return route.fulfill({json:{code:0,data:null}});
    });
    await page.goto('/#/pages/admin/storage');await expect(page.locator('.storage-card')).toHaveCount(4);
    await expect(page.getByRole('button',{name:'预览 '+keys[1],exact:true})).toBeVisible();
    for (const button of await page.locator('.storage-name-button').all()) {
      const bounds = await button.evaluate(el => {
        const text = el.querySelector('.storage-name');
        const buttonRect = el.getBoundingClientRect(), textRect = text.getBoundingClientRect();
        const firstText = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange(); range.setStart(firstText, 0); range.setEnd(firstText, 1);
        const firstRect = range.getBoundingClientRect();
        return { buttonLeft: buttonRect.left, buttonRight: buttonRect.right, textLeft: textRect.left, textRight: textRect.right,
          firstLeft: firstRect.left, firstRight: firstRect.right, width: el.clientWidth, scrollWidth: el.scrollWidth };
      });
      expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.buttonLeft - 1);
      expect(bounds.textRight).toBeLessThanOrEqual(bounds.buttonRight + 1);
      expect(bounds.firstLeft).toBeGreaterThanOrEqual(bounds.buttonLeft - 1);
      expect(bounds.firstLeft).toBeLessThanOrEqual(bounds.buttonLeft + 2);
      expect(bounds.firstRight).toBeLessThanOrEqual(bounds.buttonRight + 1);
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
    }
    fs.mkdirSync('artifacts/storage-admin',{recursive:true});await page.screenshot({path:`artifacts/storage-admin/${width}-${theme}-list.png`,fullPage:true});
    await page.getByRole('button',{name:'预览 '+keys[1],exact:true}).click();await expect(page.getByRole('dialog',{name:'预览 '+keys[1],exact:true})).toBeVisible();
    await page.screenshot({path:`artifacts/storage-admin/${width}-${theme}-preview.png`,fullPage:true});await page.getByRole('button',{name:'关闭',exact:true}).click();
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载 '+keys[0],exact:true}).click();expect((await downloaded).suggestedFilename()).toBe(keys[0]);
    await page.getByRole('button',{name:'删除 '+keys[0],exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByText('文件仍被业务记录引用，不能删除',{exact:true})).toBeVisible();
    await expect(page.locator('.storage-card')).toHaveCount(4);await page.screenshot({path:`artifacts/storage-admin/${width}-${theme}-delete.png`,fullPage:true});
    blockDelete=false;await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('.storage-card')).toHaveCount(3);
  });
}

test('对象存储非管理员不发存储请求',async({page})=>{
  await setup(page,'light',false);let calls=0;
  await page.route('**/api/system/storage/**',route=>{calls++;return route.fulfill({json:result([])})});
  await page.goto('/#/pages/admin/storage');await expect(page.getByText('仅管理员可使用对象存储管理',{exact:true})).toBeVisible();expect(calls).toBe(0);
});
