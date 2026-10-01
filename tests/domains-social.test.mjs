import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const source=await readFile(new URL('../src/services/domains/social.ts',import.meta.url),'utf8')
const {code}=await transform(source.replace(/^import .*$/gm,'').replace("export const fetchMessages", "const request=(...args)=>args;const queryPath=(path,params)=>path+'?'+Object.entries(params).filter(([,v])=>v!=null).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');\nexport const fetchMessages"),{loader:'ts',format:'esm'})
const social=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
test('关系删除按后端DELETE body保留源目标，更新ID无数字转换',()=>{const id='9223372036854775807';assert.deepEqual(social.deleteRelationship({sourcePersonId:id,targetPersonId:'2',relationType:'朋友'}),['/relationships','DELETE',{sourcePersonId:id,targetPersonId:'2',relationType:'朋友'}]);assert.equal(social.saveRelationship({id,sourcePersonId:'1',targetPersonId:'2'})[0],'/relationships/'+id);assert.equal(social.savePerson({id,name:'模拟人物'})[0],'/relationships/persons/'+id)})
test('消息单条/全部已读和管理员权限路径保持一致',()=>{assert.deepEqual(social.markRead('99'),['/message/read/99','PUT']);assert.deepEqual(social.markAllRead(),['/message/read-all','PUT']);assert.equal(social.adminDeleteMessage('99')[0],'/message/admin/99');assert.equal(social.fetchHistory('99')[0],'/llm/chat/history?conversationId=99')})
test('MCP执行参数只在主动调用时发POST，schema数据不被包装错位',()=>{assert.deepEqual(social.callTool('fixture-tool',{date:'2026-10-01'}),['/mcp/tools/call','POST',{name:'fixture-tool',arguments:{date:'2026-10-01'}}])})
