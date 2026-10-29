import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { ref, reactive, computed } from 'vue'

function gate() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function fixture(name, handlers = {}) {
  const source = await readFile(new URL(`../src/pages/coding/${name}.uvue`, import.meta.url), 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*$/gm, '')
  const calls = {}, hooks = {}, names = name === 'csdn' ? ['stats', 'articles'] : ['profile', 'contest', 'calendar', 'daily', 'recent']
  const payloads = name === 'csdn' ? { stats: { viewCount: 1234 }, articles: [] } : {
    profile: { userProfilePublicProfile: { siteRanking: 1234 }, userProfileUserQuestionProgress: { numAcceptedQuestions: [] } },
    contest: { userContestRanking: { rating: 1500 } }, calendar: { userCalendar: { submissionCalendar: '{}' } },
    daily: { todayRecord: [] }, recent: { recentACSubmissions: [] },
  }
  const dependencies = { ref, reactive, computed, onUnmounted: fn => { hooks.unmount = fn }, useAppLayout: () => ({ appGridItem: () => ({}) }), useDomainPage: (resume, suspend) => { hooks.resume = resume; hooks.suspend = suspend } }
  dependencies.fetchCodingBindings = async () => { calls.bindings = (calls.bindings || 0) + 1; return [{ platform: name, platformUsername: 'fixture-coding' }] }
  for (const key of names) dependencies['fetch' + (name === 'csdn' ? 'Csdn' : 'Leetcode') + key[0].toUpperCase() + key.slice(1)] = async () => {
    calls[key] = (calls[key] || 0) + 1
    return handlers[key] ? handlers[key]() : payloads[key]
  }
  const fields = name === 'csdn' ? 'stats, articles' : 'profile, contest, calendar, daily, recent'
  const { code } = await transform(script + `\nreturn { load, sections, loading, refreshing, error, ${fields} }`, { loader: 'ts', format: 'cjs' })
  const page = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies))
  return { page, calls, hooks, payloads }
}
const settle = async () => { for (let n = 0; n < 10; n++) await Promise.resolve() }

for (const name of ['csdn', 'leetcode']) {
  const slow = name === 'csdn' ? 'articles' : 'recent'
  const fast = name === 'csdn' ? 'stats' : 'profile'
  test(`${name}: fast section renders while another is pending; duplicate full loads do not refetch`, async () => {
    const hold = gate(), f = await fixture(name, { [slow]: () => hold.promise })
    const first = f.page.load()
    try {
      await settle()
      assert.equal(f.page.sections[fast].loaded, true)
      assert.equal(f.page[fast].value[name === 'csdn' ? 'viewCount' : 'siteRanking'], 1234)
      assert.equal(f.page.sections[slow].loading, true)
      await f.page.load()
      assert.equal(f.calls.bindings, 1)
      assert.equal(f.calls[fast], 1)
    } finally { hold.resolve(f.payloads[slow]); await first }
    assert.equal(f.page.loading.value, false)
    assert.equal(f.page.sections[slow].loaded, true)
  })
  test(`${name}: retry only failed section while another remains pending; keep completed empty data on refresh`, async () => {
    const hold = gate()
    let fail = true
    const f = await fixture(name, { [slow]: () => hold.promise, [fast]: () => { if (fail) throw Error('模拟失败'); return f.payloads[fast] } })
    const first = f.page.load()
    try {
      await settle()
      assert.equal(f.page.sections[fast].error, '模拟失败')
      fail = false
      await f.page.load(fast)
      assert.equal(f.calls.bindings, 1)
      assert.equal(f.calls[fast], 2)
      assert.equal(f.calls[slow], 1)
      assert.equal(f.page.sections[fast].loaded, true)
      assert.equal(f.page.sections[fast].error, '')
      assert.equal(f.page.loading.value, true)
    } finally { hold.resolve(f.payloads[slow]); await first }
    const empty = f.page[slow].value
    // A new request starts without clearing a successfully loaded empty region.
    const next = f.page.load(slow)
    assert.equal(f.page.sections[slow].loaded, true)
    assert.equal(f.page[slow].value, empty)
    await next
  })
  test(`${name}: hidden page ignores old response and can start a fresh load`, async () => {
    const hold = gate(), f = await fixture(name, { [slow]: () => hold.promise })
    const first = f.page.load()
    await settle()
    f.hooks.suspend(false)
    hold.resolve(name === 'csdn' ? [{ id: 'old', title: '旧请求' }] : { recentACSubmissions: [{ submissionId: 'old' }] })
    await first
    assert.deepEqual(f.page[slow].value, [])
    assert.equal(f.page.loading.value, false)
    f.hooks.resume(false)
    await f.page.load(fast)
    assert.equal(f.page.sections[fast].loaded, true)
  })
}
