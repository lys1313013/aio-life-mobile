const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures.js');
const { pbkdf2Sync } = require('node:crypto');
const { SM4 } = require('gm-crypto');
const salt='02'.repeat(32),master='fixture-master';
const key=pbkdf2Sync(master,Buffer.from(salt,'hex'),100000,16,'sha256').toString('hex');
const options={mode:'GCM',iv:salt.slice(0,16),inputEncoding:'utf8',outputEncoding:'hex'};
const encrypt=value=>SM4.encrypt(value,key,options);
const decrypt=value=>SM4.decrypt(value,key,{...options,inputEncoding:'hex',outputEncoding:'utf8'});
test('密码库兼容Web密文，编辑失败保留，提交密文，离页重新锁定',async({page})=>{
 let row={id:'9223372036854775807',title:'模拟密码',website:'https://example.test',category:'工作',username:encrypt('fixture-user'),password:encrypt('fixture-secret'),remark:encrypt('fixture-remark'),salt,favorite:false};
 const writes=[];let fail=true,deleted=false;
 await page.addInitScript(() => {
  window.vaultClipboard=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.vaultClipboard.push(value);}}});
 });
 await page.route('**/api/**', async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();let data=dashboardFixture(path);
  if(path==='/api/auth/login')data={accessToken:'vault-fixture'};
  if(path==='/api/user/info')data={id:'9007199254740993',nickname:'密码库测试'};
  if(path==='/api/password/list')data=deleted?[]:[row];
  if(path==='/api/password/categories')data=['工作'];
  if(path==='/api/password/'+row.id){
   data=row;
   if(method==='PUT'){
    writes.push(route.request().postDataJSON());
    if(fail)return route.fulfill({json:{code:1,message:'保存失败，请重试'}});
    row={...row,...writes.at(-1)};data=row;
   }
   if(method==='DELETE')deleted=true;
  }
  await route.fulfill({json:{code:0,data:data??[]}});
 });
 await page.goto('/');await page.locator('[aria-label="账号"] input').fill('fixture');await page.locator('[aria-label="密码"] input').fill('fixture-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('.dashboard-scroll')).toBeVisible();
 await page.goto('/#/pages/vault/index');
 const card=page.getByRole('button',{name:'编辑密码：模拟密码',exact:true});
 await expect(card.getByRole('img',{name:'已收藏',exact:true})).toHaveCount(0);
 await card.getByRole('button',{name:'复制密码',exact:true}).click();
 const unlock=page.getByRole('dialog',{name:'解锁密码库',exact:true});await unlock.locator('[aria-label="主密码"] input').fill(master);await unlock.getByRole('button',{name:'解锁',exact:true}).click();await expect(unlock).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.vaultClipboard)).toEqual(['fixture-secret']);
 await expect(page.getByRole('dialog',{name:'密码记录',exact:true})).toHaveCount(0);
 await expect(card).not.toContainText('fixture-secret');await expect(card).not.toContainText('fixture-user');
 await card.focus();await page.keyboard.press('Enter');const form=page.getByRole('dialog',{name:'密码记录',exact:true});
 await expect(form.locator('[aria-label="账号"] input')).toHaveValue('fixture-user');
 await expect(form.locator('[aria-label="备注"] textarea')).toHaveValue('fixture-remark');await form.locator('[aria-label="密码"] input').fill('changed-fixture');await form.getByRole('button',{name:'保存',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('保存失败');await expect(form.locator('[aria-label="密码"] input')).toHaveValue('changed-fixture');fail=false;await form.locator('[aria-label="收藏密码"]').click();await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0);
 expect(writes).toHaveLength(2);expect(decrypt(writes.at(-1).password)).toBe('changed-fixture');expect(writes.at(-1).salt).toBe(salt);expect(JSON.stringify(writes.at(-1))).not.toContain('fixture-user');
 await expect(card.getByRole('img',{name:'已收藏',exact:true})).toBeVisible();
 await page.goto('/#/pages/life/index');await page.goto('/#/pages/vault/index');await expect(page.getByRole('button',{name:'解锁',exact:true})).toBeVisible();await expect(page.getByText('fixture-user',{exact:true})).toHaveCount(0);
 await card.click();await unlock.locator('[aria-label="主密码"] input').fill(master);await unlock.getByRole('button',{name:'解锁',exact:true}).click();await expect(form).toBeVisible();
 await form.getByRole('button',{name:'删除密码',exact:true}).click();
 const confirmation=page.getByRole('dialog',{name:'删除密码',exact:true});await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:'确认',exact:true}).click();
 await expect(form).toHaveCount(0);await expect(card).toHaveCount(0);await expect(page.getByText('暂无密码记录',{exact:true})).toBeVisible();expect(deleted).toBe(true);
});
