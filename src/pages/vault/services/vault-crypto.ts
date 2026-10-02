// #ifdef APP-ANDROID || APP-IOS
import { secureRandomHex } from '@/uni_modules/aio-secure-random'
// #endif
import { SM4 } from 'gm-crypto'
import { pbkdf2Async } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

// 小程序无须依赖浏览器 TextEncoder；与其 UTF-8 和孤立代理项替换规则一致。
export function utf8Bytes(value) {
  const bytes = []
  for (const char of value) {
    let code = char.codePointAt(0)
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  }
  return new Uint8Array(bytes)
}

// 严格兼容既有 Web 存储格式：PBKDF2 SHA-256 / 100000 / 128 bit + gm-crypto SM4。
export async function vaultKey(password, salt) {
  if (!/^[0-9a-f]{64}$/i.test(salt)) throw new Error('密码记录盐值格式异常')
  return bytesToHex(await pbkdf2Async(sha256, utf8Bytes(password), hexToBytes(salt), { c: 100000, dkLen: 16, asyncTick: 10 }))
}
export async function encryptSecret(value, password, salt) {
  return SM4.encrypt(value, await vaultKey(password,salt), {mode:'GCM',iv:salt.slice(0,16),inputEncoding:'utf8',outputEncoding:'hex'})
}
export async function decryptSecret(value, password, salt) {
  if (!value || !/^[0-9a-f]+$/i.test(value)) throw new Error('密码记录密文格式异常')
  return SM4.decrypt(value, await vaultKey(password,salt), {mode:'GCM',iv:salt.slice(0,16),inputEncoding:'hex',outputEncoding:'utf8'})
}
export async function secureBytes(length) {
  // #ifdef APP-ANDROID || APP-IOS
  const nativeHex = secureRandomHex(length)
  if (typeof nativeHex !== 'string' || nativeHex.length !== length * 2 || !/^[0-9a-f]+$/i.test(nativeHex)) throw new Error('系统安全随机数生成失败')
  return hexToBytes(nativeHex)
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve,reject)=>wx.getRandomValues({length,success:r=>resolve(new Uint8Array(r.randomValues)),fail:()=>reject(new Error('安全随机数不可用'))}))
  // #endif
  // #ifndef MP-WEIXIN || APP-ANDROID || APP-IOS
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint8Array(length))
  throw new Error('当前环境缺少安全随机数能力，不能生成密码或新密钥')
  // #endif
}
export async function newSalt() {return bytesToHex(await secureBytes(32))}
export async function randomPassword(options) {
  const groups=[]
  if(options.uppercase)groups.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  if(options.lowercase)groups.push('abcdefghijklmnopqrstuvwxyz')
  if(options.numbers)groups.push('0123456789')
  if(options.symbols)groups.push('!@#$%^&*')
  if(!groups.length)throw new Error('至少选择一种字符类型')
  const pools=groups.map(g=>options.excludeAmbiguous?g.replace(/[0O1lI]/g,''):g)
  const length=Number(options.length)
  if(!Number.isInteger(length)||length<Math.max(6,pools.length)||length>128)throw new Error('密码长度应为 6 至 128')
  const all=pools.join(''),result=[]
  let bytes=await secureBytes(256),index=0
  async function pick(n){let b=0;do{if(index>=bytes.length){bytes=await secureBytes(256);index=0}b=bytes[index++]}while(b>=Math.floor(256/n)*n);return b%n}
  for(const group of pools)result.push(group[await pick(group.length)])
  while(result.length<length)result.push(all[await pick(all.length)])
  for(let i=result.length-1;i>0;i--){const j=await pick(i+1);[result[i],result[j]]=[result[j],result[i]]}
  return result.join('')
}
