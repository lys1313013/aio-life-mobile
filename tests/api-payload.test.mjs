import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/services/api-payload.ts', import.meta.url), 'utf8')
const code = (await transform(source, { loader: 'ts', format: 'esm' })).code
const payloadUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { minimalRequestPayload, pickQuery } = await import(payloadUrl)

test('动态路由创建、更新、排序保留业务字段和字符串 ID', () => {
  const row = { id: '9007199254740993', content: '任务', userId: '11', isDeleted: 1, sortOrder: 0, columnId: '2', unCompletedCount: 9 }
  assert.deepEqual(minimalRequestPayload('/tasks', 'POST', row), { content: '任务', columnId: '2', sortOrder: 0 })
  assert.deepEqual(minimalRequestPayload('/tasks/9007199254740993', 'PUT', row), { content: '任务', columnId: '2', sortOrder: 0 })
  assert.deepEqual(minimalRequestPayload('/tasks/reSort', 'POST', [row]), [{ id: row.id, columnId: '2', sortOrder: 0 }])
})

test('嵌套事件、空附件及明确 null 保留清空语义', () => {
  assert.deepEqual(minimalRequestPayload('/thought/1', 'PUT', { events: [{ id: '2', content: '事件', thoughtId: '1' }], userId: '11' }), { events: [{ id: '2', content: '事件' }] })
  assert.deepEqual(minimalRequestPayload('/honorRecords', 'PUT', { id: '1', fileIds: [], files: [{ id: '2' }] }), { id: '1', fileIds: [] })
  assert.deepEqual(minimalRequestPayload('/timeTrackerCategory', 'PUT', { id: '1', parentId: null, isDeleted: 1 }), { id: '1', parentId: null })
})

test('GET 精确路径优先，筛选保留 false 和零', () => {
  assert.deepEqual(pickQuery('/relationships/persons/search', { keyword: '人', userId: '11' }), { keyword: '人' })
  assert.deepEqual(pickQuery('/movie/page', { current: 0, activeOnly: false, userId: '11' }), { current: 0, activeOnly: false })
})

test('实际 uni.request 边界执行筛选且不修改原对象', async () => {
  const apiSource = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
  const apiCode = (await transform(apiSource
    .replace("'./api-payload.ts'", JSON.stringify(payloadUrl))
    .replace(/^import .* from '\.\/(contract|session|secondary-lock|menu-access-cache)\.ts'\n/gm, '')
    .replaceAll('import.meta.env', '{}')
    + '\nconst session = {token:"fixture"}; const unlockNavigationRevision=()=>0; const readResponse=(_status,data)=>data.data; const readUser=v=>v; const clearSession=()=>{}; const saveToken=()=>{}; const requestUnlock=()=>Promise.resolve(); const invalidateMenuAccessAfterWrite=()=>{}; const invalidateMenuAccessCache=()=>{};', { loader: 'ts', format: 'esm' })).code
  const { request } = await import('data:text/javascript;base64,' + Buffer.from(apiCode).toString('base64'))
  const previous = globalThis.uni
  let sent
  globalThis.uni = { request(options) { sent = options; options.success({statusCode: 200, data: {rscode:'0', data: {items:[],total:0}}}) } }
  try {
    const row = {id:'9007199254740993',content:'任务',userId:'11',isDeleted:1}
    const original = structuredClone(row)
    await request('/tasks/9007199254740993','PUT',row)
    assert.deepEqual(sent.data,{content:'任务'})
    assert.deepEqual(row,original)
    const data = await request('/movie/page','GET',{current:1,size:20,activeOnly:false,userId:'11'})
    assert.deepEqual(sent.data,{current:1,size:20,activeOnly:false})
    assert.deepEqual(data,{items:[],total:0})
  } finally { globalThis.uni = previous }
})
