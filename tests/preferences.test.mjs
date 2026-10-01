import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
const source = await readFile(new URL('../src/services/preferences-contract.ts', import.meta.url), 'utf8')
const { flattenMenuOptions, passwordPayload, llmPayload, notificationPayload } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('菜单隐藏继承父级，保存字符串长ID；密码不擅自裁剪',()=>{
 const items=flattenMenuOptions([{id:'root',title:'记录',children:[{id:'9223372036854775807',title:'笔记',children:[]}]}],[],false,['root'])
 assert.deepEqual(items,[{id:'9223372036854775807',title:'记录 / 笔记',hidden:true}])
 assert.throws(()=>flattenMenuOptions([{id:1,title:'无效'}]))
 assert.deepEqual(passwordPayload({oldPassword:' old ',password:' new ',confirm:' new '}),{oldPassword:' old ',newPassword:' new '})
 assert.throws(()=>passwordPayload({oldPassword:'a',password:'a',confirm:'b'}))
})
test('编辑大模型密钥留空保留，不把掩码或元数据提交；通知保存保留隐藏业务项',()=>{
 assert.deepEqual(llmPayload({id:'9223372036854775807',modelName:' model ',baseUrl:'https://example.test/v1',apiKey:'',isDefault:true}),{id:'9223372036854775807',modelName:'model',baseUrl:'https://example.test/v1',isDefault:1})
 assert.throws(()=>llmPayload({modelName:'m',baseUrl:'https://example.test',apiKey:''}))
 assert.deepEqual(notificationPayload([{bizType:'B',visible:false,channels:[{channel:'EMAIL',enabled:true}]}]),{items:[{bizType:'B',channel:'EMAIL',enabled:true}]})
})
