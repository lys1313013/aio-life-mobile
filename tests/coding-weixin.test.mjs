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
async function fixture(platform, handler) {
  const context = initScopedPreContext(platform === 'android' ? 'app' : platform, {}, platform === 'android' ? 'app-android' : undefined, true).preUVueContext
  const compiled = preprocess(source, context, { type: 'js' })
  const { code } = await transform(compiled.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' })
  const calls = [], external = [], module = { exports: {} }
  const request = async path => { calls.push(path); return handler ? handler(path) : [] }
  const uni = { request(options) { external.push(options); options.success({ statusCode: 200, data: options.url.includes('/graphql') ? { data: {} } : [] }) } }
  new Function('exports', 'module', 'request', 'queryPath', 'uni', code)(module.exports, module, request, queryPath, uni)
  return { service: module.exports, calls, external }
}

for (const platform of ['mp-weixin', 'android', 'h5']) test(`${platform} 编程页面统一走后端且不读取平台凭证`, async () => {
  const f = await fixture(platform)
  await f.service.fetchCodingBindings()
  await f.service.fetchGithubCalendar()
  await f.service.fetchRepos()
  await f.service.fetchRepoContributors('fixture/repo-name')
  await f.service.fetchRepoInfo('fixture/repo-name')
  for (const section of ['Profile', 'Contest', 'Calendar', 'Daily', 'Recent']) await f.service['fetchLeetcode' + section]()
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
  const f = await fixture('mp-weixin', path => path.endsWith('page=1') ? Array.from({ length: 100 }, (_, id) => ({ id: String(id) })) : [])
  assert.equal((await f.service.fetchRepos()).length, 100)
  assert.deepEqual(f.calls, ['/github/repos?page=1', '/github/repos?page=2'])
})

test('微信上游失败与菜单锁错误继续交给页面反馈和重试', async () => {
  for (const name of ['Error', 'SecondaryLockRequiredError']) {
    const error = Object.assign(new Error('模拟可重试错误'), { name })
    const f = await fixture('mp-weixin', () => { throw error })
    await assert.rejects(f.service.fetchLeetcodeCalendar(), value => value === error)
    await assert.rejects(f.service.fetchGithubCalendar(), value => value === error)
    assert.equal(f.external.length, 0)
  }
})
