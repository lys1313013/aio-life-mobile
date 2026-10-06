// Web 模拟接口专项，不接真实后端：node tests/personality-web.mjs
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=createRequire(import.meta.url)('@playwright/test')
const browser=await chromium.launch({headless:true,channel:'chrome'}),output=new URL('../test-results/personality/',import.meta.url).pathname
await mkdir(output,{recursive:true})
const dimensions=Array.from({length:15},(_,i)=>({code:'D'+i,name:'维度'+(i+1),model:'C',modelName:'模拟模型',percentage:60,level:'M',levelDesc:'中等',raw:3,max:5,levelNum:1,levels:{L:'低',M:'中',H:'高'}}))
const personality={code:'CODE',name:'模拟人格',motto:'模拟格言',color:'#427bea',description:'仅用于测试',vector:Array(15).fill(1),strengths:['模拟优势'],weaknesses:['模拟弱点']}
const questions={questions:[{id:1,text:'模拟问题',dimension:'D0',options:[{label:'模拟选项A',value:0},{label:'模拟选项B',value:2}]}],hiddenQuestions:[{id:1,text:'模拟饮品',options:[{label:'咖啡',value:'coffee'},{label:'茶',value:'tea'}]},{id:2,text:'模拟咖啡态度',options:[{label:'需要咖啡',value:'need'}]}],dimensionDefs:dimensions}
let submitted=[],registered=[],cbtiRows=[]
async function mock(page){await page.route('http://127.0.0.1:5180/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body=null;try{body=req.postDataJSON()}catch{};let data
if(path==='/api/user/info')data={id:'7',username:'fixture',nickname:'模拟用户',roles:['admin']}
else if(path==='/api/menu/all')data=[]
else if(path==='/api/cbti/questions')data=questions
else if(path==='/api/cbti/personalities')data=[personality]
else if(path==='/api/cbti/results')data=cbtiRows
else if(path==='/api/cbti/test'){submitted.push(body);cbtiRows=[{id:'9223372036854775807',personalityCode:'CODE',name:'模拟人格',similarity:88,createTime:'2026-10-01 10:00'}];data={personality,dimensions,similarity:88,matchDetails:[{code:'CODE',name:'模拟人格',similarity:88}]}}
else if(path==='/api/auth/register'||path==='/api/auth/resetPassword'){registered.push({path,body});data=null}
else if(path==='/api/auth/sendEmailCode'||path==='/api/auth/sendResetPasswordCode')data=null
await route.fulfill({json:data===undefined?{code:1,message:'无模拟接口 '+path}:{code:0,data}})})}
try{
for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:1000}])for(const theme of ['light','dark']){
const context=await browser.newContext({viewport});await context.addInitScript(({theme})=>{localStorage.setItem('aio-life-mobile.access-token.v1','synthetic-token');localStorage.setItem('aio-life-mobile.theme.v1',theme)},{theme});const page=await context.newPage();page.on('pageerror',error=>console.log('PAGEERROR '+error.message));page.on('console',message=>{if(message.type()==='error')console.log('CONSOLE '+message.text())});page.on('response',response=>{if(response.status()>=400)console.log('HTTP '+response.status()+' '+response.url())});await mock(page)
await page.goto('http://127.0.0.1:5180/#/pages/personality/cbti');await page.getByRole('button',{name:'开始测试',exact:true}).waitFor({timeout:10000}).catch(async reason=>{await page.screenshot({path:output+'debug.png',fullPage:true});console.log(await page.locator('body').innerText());throw reason});await page.screenshot({path:output+viewport.width+'-'+theme+'.png',fullPage:true})
await page.getByRole('button',{name:'开始测试',exact:true}).click();await page.getByRole('button',{name:'模拟选项A',exact:true}).click();await page.getByRole('button',{name:'完成问卷',exact:true}).click();await page.getByRole('button',{name:'咖啡',exact:true}).click();await page.getByRole('button',{name:'需要咖啡',exact:true}).click();await page.getByText('CODE · 模拟人格',{exact:true}).first().waitFor();assert.deepEqual(submitted.at(-1),{answers:{1:0},hiddenAnswers:{drink:'coffee',drinkAttitude:'need'}})
await page.getByRole('button',{name:'生成海报',exact:true}).click();await page.getByRole('button',{name:'保存海报',exact:true}).waitFor({timeout:10000});const poster=await page.locator('img[src^="data:image/"]').last().getAttribute('src');await writeFile(output+viewport.width+'-'+theme+'-poster.png',Buffer.from(poster.split(',')[1],'base64'));await page.screenshot({path:output+viewport.width+'-'+theme+'-result.png',fullPage:true});await context.close();console.log('CBTI '+viewport.width+' '+theme+' 问卷/隐藏题/海报通过')}
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await mock(page);await page.goto('http://127.0.0.1:5180/#/pages/auth/index?mode=reset');await page.getByRole('textbox',{name:'邮箱',exact:true}).fill('fixture@example.test');await page.getByRole('spinbutton',{name:'验证码',exact:true}).fill('123456');await page.locator('input[aria-label="密码"]').fill('fixture-password');await page.locator('input[aria-label="确认密码"]').fill('wrong-password');await page.getByRole('button',{name:'重置密码',exact:true}).click();await page.getByText('两次密码不一致',{exact:true}).waitFor();assert.equal(registered.length,0);await page.locator('input[aria-label="确认密码"]').fill('fixture-password');await page.getByRole('button',{name:'重置密码',exact:true}).click();await page.getByText('密码已重置',{exact:true}).waitFor();assert.deepEqual(registered.at(-1),{path:'/api/auth/resetPassword',body:{email:'fixture@example.test',code:'123456',password:'fixture-password'}});await context.close();console.log('找回密码失败保留/快速修正提交通过')
}finally{await browser.close()}
