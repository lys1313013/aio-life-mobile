import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const source = await readFile(new URL('../src/services/attachments.ts', import.meta.url), 'utf8')
const auth = source.slice(source.indexOf('export function authFileUrl'))
const code = (await transform(`export function fixture() {
  const session = {token:'old-user'}, revoked=[]; let download;
  const uni={downloadFile:options=>{download=options},reLaunch:()=>{}};
  const URL={revokeObjectURL:url=>revoked.push(url)};
  const apiUrl=path=>path, clearSession=()=>{session.token=''};
  function current(token){if(token!==session.token) throw Error('登录状态已变化')}
  ${auth.replace('export function', 'function')}
  return {authFileUrl,session,revoked,complete:response=>download.success(response),headers:()=>download.header};
}`, {loader:'ts',format:'esm'})).code
const { fixture } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
test('授权缩略图下载完成时账号已切换，拒绝旧图并释放无接收者blob', async () => {
  const f=fixture(); const task=f.authFileUrl('image-id'); assert.equal(f.headers().Authorization,'Bearer old-user'); f.session.token='new-user'; f.complete({statusCode:200,tempFilePath:'blob:old-user-photo'}); await assert.rejects(task,/登录状态已变化/); assert.deepEqual(f.revoked,['blob:old-user-photo']);
})
test('同账号成功下载交付图片，失败下载释放blob', async () => {
  const f=fixture(); const task=f.authFileUrl('image-id'); f.complete({statusCode:200,tempFilePath:'blob:good-photo'}); assert.equal(await task,'blob:good-photo'); assert.deepEqual(f.revoked,[]);
  const failed=f.authFileUrl('image-id'); f.complete({statusCode:503,tempFilePath:'blob:failed-photo'}); await assert.rejects(failed,/附件加载失败/); assert.deepEqual(f.revoked,['blob:failed-photo']);
})
