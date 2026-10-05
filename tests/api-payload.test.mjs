import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/services/api-payload.ts', import.meta.url), 'utf8')
const code = (await transform(source, { loader: 'ts', format: 'esm' })).code
const payloadUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { minimalRequestPayload, pickQuery } = await import(payloadUrl)

test('会员平台关联保留长 ID、明确解绑和停用，剔除只读派生字段', () => {
  const id = '9007199254740993'
  for (const providerId of [id, null]) {
    assert.deepEqual(minimalRequestPayload('/membership', 'PUT', {
      id, providerId, providerName: '腾讯视频', providerIconKey: 'tencent_video', providerIdProvided: true,
    }), { id, providerId })
  }
  assert.deepEqual(minimalRequestPayload('/membership', 'PUT', { id, providerId: undefined }), { id })
  assert.deepEqual(minimalRequestPayload('/system/membership-providers/' + id, 'PUT', {
    name: '腾讯视频', code: 'tencent_video', category: 'video', iconKey: null,
    sortOrder: 0, isEnabled: 0, id, createUser: '1',
  }), { name: '腾讯视频', code: 'tencent_video', category: 'video', iconKey: null, sortOrder: 0, isEnabled: 0 })
})

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

test('视频封面批量查询保留完整字符串 ID 并拒绝用户归属参数', () => {
  const ids = '9007199254740993,9223372036854775806'
  assert.deepEqual(minimalRequestPayload('/b-video/covers', 'GET', { ids, userId: '11' }), { ids })
})

test('实际 uni.request 边界执行筛选且不修改原对象', async () => {
  const apiSource = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
  const refreshSource = await readFile(new URL('../src/services/home-refresh.ts', import.meta.url), 'utf8')
  const refreshCode = (await transform(refreshSource, { loader: 'ts', format: 'esm' })).code
  const refreshUrl = 'data:text/javascript;base64,' + Buffer.from(refreshCode).toString('base64')
  const { homeDataRevision } = await import(refreshUrl)
  const apiCode = (await transform(apiSource
    .replace("'./api-payload.ts'", JSON.stringify(payloadUrl))
    .replace("'./home-refresh.ts'", JSON.stringify(refreshUrl))
    .replace(/^import .* from '\.\/(contract|session|secondary-lock|menu-access-cache|menu-visuals|page-refresh-state)\.ts'\n/gm, '')
    .replaceAll('import.meta.env', '{}')
    + '\nconst menuVisuals={afterWrite:()=>{}}; const invalidatePageAfterWrite=()=>{}; const session = {token:"fixture"}; const unlockNavigationRevision=()=>0; const readResponse=(_status,data)=>{if(_status>=400)throw Error("失败");return data.data}; const readUser=v=>v; const clearSession=()=>{}; const saveToken=()=>{}; const requestUnlock=()=>Promise.resolve(); const invalidateMenuAccessAfterWrite=()=>{}; const invalidateMenuAccessCache=()=>{};', { loader: 'ts', format: 'esm' })).code
  const { request } = await import('data:text/javascript;base64,' + Buffer.from(apiCode).toString('base64'))
  const previous = globalThis.uni
  let sent
  globalThis.uni = { request(options) { sent = options; options.success({statusCode: 200, data: {rscode:'0', data: {items:[],total:0}}}) } }
  try {
    const row = {id:'9007199254740993',content:'任务',userId:'11',isDeleted:1}
    const original = structuredClone(row)
    const watchedRevision = homeDataRevision('watched')
    await request('/tasks/9007199254740993','PUT',row)
    assert.equal(homeDataRevision('watched'), watchedRevision + 1)
    assert.deepEqual(sent.data,{content:'任务'})
    assert.deepEqual(row,original)
    const cursor = '1791163200:9007199254740993'
    await request('/weread/recent', 'GET', { cursor, size: 6, userId: 'other' })
    assert.deepEqual(sent.data, { cursor, size: 6 })
    const data = await request('/movie/page','GET',{current:1,size:20,activeOnly:false,userId:'11'})
    assert.deepEqual(sent.data,{current:1,size:20,activeOnly:false})
    assert.deepEqual(data,{items:[],total:0})
    assert.equal(homeDataRevision('watched'), watchedRevision + 1)
    for (const path of ['/goals', '/anniversaryRecords']) {
      await request(path, 'POST', { title: '固定记录', isPinned: 1, pinnedSort: -99, userId: 'other' })
      assert.deepEqual(sent.data, { title: '固定记录', isPinned: 1 })
      await request(path, 'PUT', { id: row.id, isPinned: 0, pinnedSort: -99, userId: 'other' })
      assert.deepEqual(sent.data, { id: row.id, isPinned: 0 })
      await request(`${path}/${row.id}/pin`, 'PUT', { isPinned: 0, pinnedSort: -99, userId: 'other' })
      assert.deepEqual(sent.data, { isPinned: 0 })
      const ids = [row.id, '9223372036854775806']
      await request(`${path}/pinned-order`, 'PUT', { ids, userId: 'other' })
      assert.deepEqual(sent.data, { ids })
      await request(path, 'GET', { isPinned: 1, userId: 'other' })
      assert.deepEqual(sent.data, { isPinned: 1 })
    }
    for (const path of ['/read-record/page', '/movie/page']) {
      const query = { current: 2, size: 20, activeOnly: true, inProgressFirst: true }
      await request(path, 'GET', { ...query, userId: 'other' })
      assert.deepEqual(sent.data, query)
    }
    const beforeFailure = homeDataRevision('watched')
    globalThis.uni.request = options => options.success({ statusCode: 503, data: {} })
    await assert.rejects(request('/tasks/1', 'DELETE'), /失败/)
    assert.equal(homeDataRevision('watched'), beforeFailure)
  } finally { globalThis.uni = previous }
})
