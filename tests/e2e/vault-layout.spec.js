const { test, expect } = require('./support/test');
const { dashboardFixture } = require('./fixtures.js');
const { pullDown } = require('./gestures.js');

const fixtureRows = [
  { id:'9223372036854775807',title:'DeepSeek',category:'学习',favorite:true },
  { id:'9223372036854775806',title:'GitHub api token',category:'学习',favorite:false },
  { id:'9223372036854775805',title:'Google',category:'其他',favorite:false },
  { id:'9223372036854775804',title:'bandizip',category:'生活',favorite:false },
  { id:'9223372036854775803',title:'阿里云 ACR 固定密码 / 一个需要完整换行展示的很长的模拟标题',category:'工作',favorite:false },
  { id:'9223372036854775802',title:'OpenRouter',category:'其他',favorite:false },
];

async function setup(page, theme) {
  await page.addInitScript(theme => localStorage.setItem('aio-life-mobile.theme.v1', theme), theme);
  const state = { rows:fixtureRows, error:false, hold:null, release:null };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data=dashboardFixture(path);
    if(path==='/api/auth/login')data={accessToken:'vault-layout-fixture'};
    if(path==='/api/user/info')data={id:'9007199254740993',nickname:'密码卡片模拟用户'};
    if(path==='/api/password/categories')data=['学习','其他','生活','工作'];
    if(path==='/api/password/list') {
      if(state.hold)await state.hold;
      if(state.error)return route.fulfill({json:{code:1,message:'模拟读取失败'}});
      data=state.rows;
    }
    await route.fulfill({json:{code:0,message:null,data:data??[]}});
  });
  await page.goto('/');
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  return state;
}

for(const width of [390,820,1280])for(const theme of ['light','dark']){
  test(`标题优先密码卡片 ${width} ${theme}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:960});
    const state=await setup(page,theme);
    state.hold=new Promise(resolve=>{state.release=resolve;});
    await page.goto('/#/pages/vault/index');
    const skeleton=page.getByRole('status',{name:'正在加载密码记录',exact:true});
    await expect(skeleton).toBeVisible();
    const skeletonHeight=(await skeleton.locator('.vault-card').first().boundingBox()).height;
    state.release();state.hold=null;
    const cards=page.locator('.vault-card[role="button"]');
    await expect(cards).toHaveCount(6);
    await expect(page.locator('.vault-card-dark')).toHaveCount(theme==='dark'?6:0);
    expect(Math.abs((await cards.first().boundingBox()).height-skeletonHeight)).toBeLessThanOrEqual(1);
    await expect(cards.first().getByRole('img',{name:'已收藏',exact:true})).toBeVisible();
    await expect(cards.nth(1).getByRole('img',{name:'已收藏',exact:true})).toHaveCount(0);
    const geometry=await cards.first().evaluate(card=>{
      const rect=card.getBoundingClientRect(),tag=card.querySelector('.vault-category-tag').getBoundingClientRect(),star=card.querySelector('.vault-favorite').getBoundingClientRect(),copy=card.querySelector('.vault-copy').getBoundingClientRect();
      return {starRight:star.x>rect.x+rect.width/2,tagLeft:tag.x<rect.x+rect.width/2,copyRight:copy.x>rect.x+rect.width/2,fontSize:parseFloat(getComputedStyle(card.querySelector('.vault-title')).fontSize)};
    });
    expect(geometry).toEqual({starRight:true,tagLeft:true,copyRight:true,fontSize:18});
    const starSource=await cards.first().locator('.vault-favorite image, .vault-favorite img').first().getAttribute('src');
    const starSvg=starSource.includes(';base64,')?Buffer.from(starSource.split(',')[1],'base64').toString('utf8'):decodeURIComponent(starSource);
    expect(starSvg).toContain(theme==='dark'?'#f6c94c':'#bd8700');
    for(const card of await cards.all()){
      const box=await card.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
      const overflow=await card.evaluate(el=>[...el.querySelectorAll('*')].some(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right+1));
      expect(overflow).toBe(false);
    }
    await page.screenshot({path:testInfo.outputPath(`vault-${width}-${theme}.png`),fullPage:true});
    state.hold=new Promise(resolve=>{state.release=resolve;});
    const before=await cards.nth(1).evaluate(el=>({top:el.offsetTop,height:el.offsetHeight}));
    await pullDown(page,'.mobile-page-scroll');
    await expect(page.getByRole('status',{name:'正在更新内容',exact:true})).toBeVisible();
    expect(await cards.nth(1).evaluate(el=>({top:el.offsetTop,height:el.offsetHeight}))).toEqual(before);
    await expect(page.getByRole('status',{name:'正在加载密码记录',exact:true})).toHaveCount(0);
    state.release();state.hold=null;
    await expect(page.getByRole('status',{name:'正在更新内容',exact:true})).toHaveCount(0);
    await page.locator('.vault-search-input input').fill('GitHub');await expect(cards).toHaveCount(1);await expect(cards).toContainText('GitHub api token');
    await page.locator('.vault-search-input input').fill('没有匹配');await expect(page.getByText('没有匹配的密码',{exact:true})).toBeVisible();
  });
}

test('密码卡片失败重试、空态和单条刷新保留布局',async({page})=>{
  const state=await setup(page,'light');state.error=true;
  await page.goto('/#/pages/vault/index');await expect(page.getByRole('alert')).toContainText('模拟读取失败');
  state.error=false;state.rows=[];await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('暂无密码记录',{exact:true})).toBeVisible();
  const empty=page.getByText('暂无密码记录',{exact:true}),before=await empty.evaluate(el=>({top:el.offsetTop,height:el.offsetHeight}));
  state.hold=new Promise(resolve=>{state.release=resolve;});await pullDown(page,'.mobile-page-scroll');await expect(empty).toBeVisible();expect(await empty.evaluate(el=>({top:el.offsetTop,height:el.offsetHeight}))).toEqual(before);state.release();state.hold=null;
  await expect(page.getByRole('status',{name:'正在更新内容',exact:true})).toHaveCount(0);
  state.rows=[fixtureRows[0]];await pullDown(page,'.mobile-page-scroll');await expect(page.locator('.vault-card[role="button"]')).toHaveCount(1);
  state.error=true;await pullDown(page,'.mobile-page-scroll');await expect(page.getByRole('alert')).toContainText('模拟读取失败');await expect(page.locator('.vault-card[role="button"]')).toHaveCount(1);
  state.error=false;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});
