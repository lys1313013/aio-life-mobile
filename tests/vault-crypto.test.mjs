import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pbkdf2Sync } from 'node:crypto'
import { SM4 } from 'gm-crypto'
let source=await readFile(new URL('../src/services/vault-crypto.ts',import.meta.url),'utf8')
source=source.replace(/\/\/ #ifdef (?:MP-WEIXIN|APP-ANDROID \|\| APP-IOS)[\s\S]*?\/\/ #endif/g,'')
for(const pkg of ['gm-crypto','@noble/hashes/pbkdf2','@noble/hashes/sha256','@noble/hashes/utils'])source=source.replace(`from '${pkg}'`,`from '${import.meta.resolve(pkg)}'`)
const {utf8Bytes,vaultKey,encryptSecret,decryptSecret,randomPassword}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('密码库派生密钥与Web PBKDF2一致，Web密文在移动端解密',async()=>{
 const salt='02'.repeat(32),password='中文 fixture master',plain='fixture密码!'
 const expected=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,16,'sha256').toString('hex')
 assert.equal(await vaultKey(password,salt),expected)
 const web=SM4.encrypt(plain,expected,{mode:'GCM',iv:salt.slice(0,16),inputEncoding:'utf8',outputEncoding:'hex'})
 assert.equal(await decryptSecret(web,password,salt),plain)
 assert.equal(await encryptSecret(plain,password,salt),web)
 await assert.rejects(()=>vaultKey(password,'bad'))
})
test('生成器遵守长度、各字符类型与排除易混淆字符',async()=>{
 const value=await randomPassword({length:32,uppercase:true,lowercase:true,numbers:true,symbols:true,excludeAmbiguous:true})
 assert.equal(value.length,32);assert.match(value,/[A-Z]/);assert.match(value,/[a-z]/);assert.match(value,/[2-9]/);assert.match(value,/[!@#$%^&*]/);assert.doesNotMatch(value,/[0O1lI]/)
 await assert.rejects(()=>randomPassword({length:5,lowercase:true}))
 await assert.rejects(()=>randomPassword({length:16}))
})

test('小程序UTF8不依赖TextEncoder，中文与emoji及孤立代理项兼容Web',()=>{
 for(const value of ['中文🔑','a\ud800b','\udc00',''])assert.deepEqual(utf8Bytes(value),new TextEncoder().encode(value))
})
