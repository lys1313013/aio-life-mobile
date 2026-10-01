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
 const writes=[];let fail=true;
 await page.route('http://127.0.0.1:5180/api/**', async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();let data=dashboardFixture(path);
  if(path==='/api/auth/login')data={accessToken:'vault-fixture'};
  if(path==='/api/user/info')data={id:'9007199254740993',nickname:'密码库测试'};
  if(path==='/api/password/list')data=[row];
  if(path==='/api/password/categories')data=['工作'];
  if(path==='/api/password/'+row.id){
   data=row;
   if(method==='PUT'){
    writes.push(route.request().postDataJSON());
    if(fail)return route.fulfill({json:{rscode:'1',result:'保存失败，请重试'}});
    row={...row,...writes.at(-1)};data=row;
   }
  }
  await route.fulfill({json:{rscode:'0',data:data??[]}});
 });
 await page.goto('/');await page.locator('[aria-label="账号"] input').fill('fixture');await page.locator('[aria-label="密码"] input').fill('fixture-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('.dashboard-scroll')).toBeVisible();
 await page.goto('/#/pages/vault/index');
 await page.getByRole('button',{name:'解锁',exact:true}).click();
 const unlock=page.getByRole('dialog',{name:'解锁密码库',exact:true});await unlock.locator('[aria-label="主密码"] input').fill(master);await unlock.getByRole('button',{name:'解锁',exact:true}).click();await expect(unlock).toHaveCount(0);
 await expect(page.getByText('fixture-user',{exact:true})).toBeVisible();await page.getByRole('button',{name:'显示或隐藏密码'}).click();await expect(page.getByText('fixture-secret',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'编辑密码',exact:true}).click();const form=page.getByRole('dialog',{name:'密码记录',exact:true});
 await expect(form.locator('[aria-label="备注"] textarea')).toHaveValue('fixture-remark');await form.locator('[aria-label="密码"] input').fill('changed-fixture');await form.getByRole('button',{name:'保存',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('保存失败');await expect(form.locator('[aria-label="密码"] input')).toHaveValue('changed-fixture');fail=false;await form.getByRole('button',{name:'保存',exact:true}).click();await expect(form).toHaveCount(0);
 expect(writes).toHaveLength(2);expect(decrypt(writes.at(-1).password)).toBe('changed-fixture');expect(writes.at(-1).salt).toBe(salt);expect(JSON.stringify(writes.at(-1))).not.toContain('fixture-user');
 await page.goto('/#/pages/life/index');await page.goto('/#/pages/vault/index');await expect(page.getByRole('button',{name:'解锁',exact:true})).toBeVisible();await expect(page.getByText('fixture-user',{exact:true})).toHaveCount(0);
});
