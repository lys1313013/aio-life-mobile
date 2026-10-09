import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/services/dashboard.ts', import.meta.url), 'utf8')
const responseSource = await readFile(new URL('../src/services/time-response.ts', import.meta.url), 'utf8')
const code = (await transform(responseSource + '\n' + source.replace(/^import .*$/gm, '')
  + '\nconst request = (...args) => globalThis.__timeDayRequest(...args);', { loader: 'ts', format: 'esm' })).code
const { getDateRecords } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

test('单日超过原分页上限仍一次完整返回，保留长ID，不发送分页参数', async () => {
  const rows = Array.from({ length: 151 }, (_, i) => ({ id: String(9223372036854775807n - BigInt(i)), startTime: i }))
  const calls = []
  globalThis.__timeDayRequest = async (...args) => { calls.push(args); return rows }
  try {
    assert.deepEqual(await getDateRecords('2026-10-04'), rows)
    assert.deepEqual(calls, [['/timeRecord/query?date=2026-10-04', 'GET', null, true, null, false]])
    assert.equal((await getDateRecords('2026-10-04'))[0].id, '9223372036854775807')
  } finally { delete globalThis.__timeDayRequest }
})

test('空数组正常返回，失败保留错误供页面重试', async () => {
  globalThis.__timeDayRequest = async () => []
  try {
    assert.deepEqual(await getDateRecords('2026-10-04'), [])
    globalThis.__timeDayRequest = async () => { throw new Error('服务暂不可用') }
    await assert.rejects(getDateRecords('2026-10-04'), /服务暂不可用/)
  } finally { delete globalThis.__timeDayRequest }
})

test('首页单日查询静默处理菜单锁，其他入口仍可主动解锁', async () => {
  const calls = []
  globalThis.__timeDayRequest = async (...args) => { calls.push(args); return [] }
  try {
    await getDateRecords('2026-10-04', true)
    await getDateRecords('2026-10-04')
    assert.deepEqual(calls.map(args => args[5]), [true, false])
  } finally { delete globalThis.__timeDayRequest }
})
