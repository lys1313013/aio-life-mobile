import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformSync } from 'esbuild'

const helpers = await import('data:text/javascript;base64,' + Buffer.from(transformSync(await readFile('src/services/pagination.ts', 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'))
const ref = value => ({ value })
async function functionSource(path, name) {
  const source = await readFile('src/' + path, 'utf8')
  const match = source.match(new RegExp('async function ' + name + '\\([^]*?\\n}'))
  assert.ok(match)
  return transformSync(match[0], { loader: 'ts' }).code
}
for (const [path, api] of [
  ['pages/goods/devices.uvue', 'fetchDevicePage'],
  ['pages/records/activity.uvue', 'fetchPerformancePage'],
  ['pages/records/categories.uvue', 'fetchCategoryPage'],
  ['pages/records/video.uvue', 'fetchVideoPage'],
]) {
  async function fixture(responses) {
    const calls = []
    const values = {
      ...helpers, generation: 0, alive: true, requestedEdit: '', requestedCreate: false,
      typeFilter: ref('全部类型'), type: ref('exercise_type'), status: ref('全部'), statuses: [], statusLabels: {},
      rows: ref([{ id: 'previous' }]), types: ref([]), counts: ref({}), statistics: ref({}), loadedType: ref(''),
      loading: ref(false), refreshing: ref(false), error: ref(''),
      scope: { wait: promise => promise }, fetchDictionary: async () => ({ dictDetailList: [] }),
      fetchCategoryTypes: async () => [], fetchVideoCounts: async () => ({}), fetchVideoStatistics: async () => ({}),
      stopCoverPolling() {}, pollCovers() {}, loadPhoto() {},
      [api]: async page => {
        calls.push(page)
        const response = responses.shift()
        if (response instanceof Error) throw response
        if (!response) throw Error('unexpected page request')
        return response
      },
    }
    const isVideo = path === 'pages/records/video.uvue'
    if (isVideo) {
      const target = { label: '全部状态', loaded: false, stale: false, revision: 0 }
      for (const key of ['rows', 'loading', 'error']) Object.defineProperty(target, key, {
        get: () => values[key].value, set: value => { values[key].value = value },
      })
      values.pages = ref([target]); values.currentPage = ref(target); values.pageRequests = new Map()
    }
    const load = new Function(...Object.keys(values), await functionSource(path, isVideo ? 'loadPage' : 'load') +
      (isVideo ? '\nreturn () => loadPage(0, true)' : '\nreturn load'))(...Object.values(values))
    return { ...values, calls, load }
  }
  test(path + ' 未知 total 继续短页，重复 ID 合并，空页终止', async () => {
    const f = await fixture([
      { total: null, items: [{ id: '1', name: 'old', detail: 'preserved' }] },
      { items: [{ id: '1', name: 'new' }, { id: '2' }] },
      { total: null, items: [] },
    ])
    await f.load()
    assert.equal(f.error.value, '')
    assert.deepEqual(f.calls, [1, 2, 3])
    assert.deepEqual(f.rows.value, [{ id: '1', name: 'new', detail: 'preserved' }, { id: '2' }])
  })
  test(path + ' 已知总数终止，读取失败保留旧列表', async () => {
    const f = await fixture([{ total: 1, items: [{ id: '1' }] }])
    await f.load()
    assert.deepEqual(f.calls, [1])
    const failure = await fixture([{ total: null, items: [{ id: '1' }] }, Error('offline')])
    await failure.load()
    assert.deepEqual(failure.rows.value, [{ id: 'previous' }])
    assert.equal(failure.error.value, 'offline')
    assert.equal(failure.loading.value, false)
  })
}

test('关联设备未知总数、分页失败重试与空页终止', async () => {
  const calls = [], responses = [
    { total: null, items: [{ id: '1', detail: 'preserved' }] },
    Error('offline'),
    { total: null, items: [{ id: '1', name: 'updated' }, { id: '2' }] },
    { total: null, items: [] },
  ]
  const values = { ...helpers, alive: true, sequence: 0, page: 0, searchName: '', retryReset: true,
    choices: ref([]), choicesBusy: ref(false), choicesError: ref(''), total: ref(null), choicesEnded: ref(false), keyword: ref(''),
    searchDevices: async page => { calls.push(page); const result = responses.shift(); if (result instanceof Error) throw result; return result },
  }
  const load = new Function(...Object.keys(values), await functionSource('pages/finance/components/ExpenseDeviceModal.uvue', 'loadChoices') + '\nreturn loadChoices')(...Object.values(values))
  await load(true)
  await load()
  assert.equal(values.choicesError.value, 'offline')
  assert.deepEqual(values.choices.value, [{ id: '1', detail: 'preserved' }])
  values.choicesError.value = ''
  await load()
  assert.deepEqual(values.choices.value, [{ id: '1', detail: 'preserved', name: 'updated' }, { id: '2' }])
  await load()
  await load()
  assert.deepEqual(calls, [1, 2, 2, 3])
  assert.equal(values.choicesEnded.value, true)
})
