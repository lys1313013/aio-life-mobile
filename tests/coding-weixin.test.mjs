import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build, transform } from 'esbuild'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js')
const source = await readFile(new URL('../src/pages/coding/services/coding.ts', import.meta.url), 'utf8')
const queryCode = (await build({ entryPoints: [new URL('../src/services/query-path.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm' })).outputFiles[0].text
const { queryPath } = await import('data:text/javascript;base64,' + Buffer.from(queryCode).toString('base64'))
async function fixture(wechat, handler) {
  const context = initScopedPreContext(wechat ? 'mp-weixin' : 'h5', {}, undefined, true).preUVueContext
  const compiled = preprocess(source, context, { type: 'js' })
  const { code } = await transform(compiled.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' })
  const calls = [], external = [], module = { exports: {} }
  const request = async path => { calls.push(path); return handler ? handler(path) : [] }
  const uni = { request(options) { external.push(options); options.success({ statusCode: 200, data: options.url.includes('/graphql') ? { data: {} } : [] }) } }
  new Function('exports', 'module', 'request', 'queryPath', 'uni', code)(module.exports, module, request, queryPath, uni)
  return { service: module.exports, calls, external }
}

test('微信编程页面所有数据只走后端且不读取平台Token', async () => {
  const f = await fixture(true)
  await f.service.fetchCodingBindings(true)
  await f.service.fetchGithubCalendar('ignored-user', 'never-send-token')
  await f.service.fetchRepos('ignored-user', 'never-send-token')
  await f.service.fetchRepoContributors('fixture/repo-name', 'never-send-token')
  await f.service.fetchRepoInfo('fixture/repo-name', 'never-send-token')
  for (const section of ['Profile', 'Contest', 'Calendar', 'Daily', 'Recent']) await f.service['fetchLeetcode' + section]('ignored-user')
  await f.service.fetchCsdnStats('fixture')
  await f.service.fetchCsdnArticles('fixture')
  assert.deepEqual(f.calls, [
    '/userbinds/list?includeToken=false', '/github/calendar', '/github/repos?page=1',
    '/github/repository/contributors?name=repo-name', '/github/repository/info?name=repo-name',
    ...['profile', 'contest', 'calendar', 'daily', 'recent'].map(section => '/leetcode/data/' + section),
    '/csdn/stats?username=fixture', '/csdn/articles?username=fixture&limit=20',
  ])
  assert.equal(f.external.length, 0)
})

test('微信仓库分页完整读取并在空页停止', async () => {
  const f = await fixture(true, path => path.endsWith('page=1') ? Array.from({ length: 100 }, (_, id) => ({ id: String(id) })) : [])
  assert.equal((await f.service.fetchRepos('fixture')).length, 100)
  assert.deepEqual(f.calls, ['/github/repos?page=1', '/github/repos?page=2'])
})

test('微信上游失败与菜单锁错误继续交给页面反馈和重试', async () => {
  for (const name of ['Error', 'SecondaryLockRequiredError']) {
    const error = Object.assign(new Error('模拟可重试错误'), { name })
    const f = await fixture(true, () => { throw error })
    await assert.rejects(f.service.fetchLeetcodeCalendar('fixture'), value => value === error)
    await assert.rejects(f.service.fetchGithubCalendar('fixture', ''), value => value === error)
    assert.equal(f.external.length, 0)
  }
})

test('H5仍使用既有GitHub直连和LeetCode同源代理', async () => {
  const f = await fixture(false)
  await f.service.fetchCodingBindings(true)
  await f.service.fetchGithubCalendar('fixture', 'fixture-platform-token')
  await f.service.fetchRepos('fixture', 'fixture-platform-token')
  await f.service.fetchLeetcodeProfile('fixture')
  assert.deepEqual(f.calls, ['/userbinds/list?includeToken=true'])
  assert.equal(f.external[0].url, 'https://api.github.com/graphql')
  assert.equal(f.external[0].header.Authorization, 'Bearer fixture-platform-token')
  assert.equal(f.external[2].url, '/leetcode-api/graphql')
})
