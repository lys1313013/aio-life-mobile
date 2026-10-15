import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { effectScope, nextTick } from 'vue'
import { transformSync } from 'esbuild'

const vueURL = new URL('../node_modules/vue/index.mjs', import.meta.url).href
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')
let sequence = 0

// 执行两页真实脚本；模拟微信在逻辑层 nextTick 之后才回填组件引用。
async function fixture(kind, t) {
  const key = `__financePage${++sequence}`
  const hooks = {}
  globalThis[key] = hooks
  const domainImport = `const useDomainPage = (resume, suspend, options) => Object.assign(globalThis[${JSON.stringify(key)}], { resume, suspend, options });`
  let source = (await readFile(new URL(`../src/pages/finance/${kind}.uvue`, import.meta.url), 'utf8')).split('<script setup lang="ts">')[1].split('</script>')[0]
  if (source.includes("'./services/use-ledger-page.ts'")) {
    const helper = (await readFile(new URL('../src/pages/finance/services/use-ledger-page.ts', import.meta.url), 'utf8'))
      .replace(/from 'vue'/g, `from ${JSON.stringify(vueURL)}`)
      .replace(/import \{ useDomainPage \}[^\n]+/, domainImport)
    source = source.replace("'./services/use-ledger-page.ts'", JSON.stringify(moduleURL(helper)))
  }
  source = source.replace(/from 'vue'/g, `from ${JSON.stringify(vueURL)}`)
    .replace(/import \{ useDomainPage \}[^\n]+/, domainImport)
    .replace(/import Ledger[^\n]+/, '')
  const lines = source.split('\n')
  const imports = lines.filter(line => line.startsWith('import ')).join('\n')
  const body = lines.filter(line => !line.startsWith('import ')).join('\n')
  const { setup } = await import(moduleURL(`${imports}\nexport function setup() {\n${body}\nreturn { mounted, visible, ledger };\n}`))
  const scope = effectScope()
  const state = scope.run(setup)
  const calls = []
  const child = { resume: refresh => calls.push(['resume', refresh]), suspend: clear => calls.push(['suspend', clear]), loading: false, error: '' }
  t.after(() => { scope.stop(); delete globalThis[key] })
  return { ...state, hooks, calls, child }
}

for (const kind of ['expense', 'income']) {
  test(`${kind} 微信延迟回填引用后仍执行首次查询，合并待执行刷新`, async t => {
    const f = await fixture(kind, t)
    await f.hooks.resume(false)
    await f.hooks.resume(true)
    await f.hooks.resume(false)
    await nextTick()
    assert.equal(f.mounted.value, true)
    assert.deepEqual(f.calls, [])
    f.ledger.value = f.child
    await nextTick()
    assert.deepEqual(f.calls, [['resume', true]])
    assert.deepEqual(f.hooks.options.keys(), [kind, 'userDictData', 'userDictType'])
  })
  test(`${kind} 挂载前离页取消加载，返回时重新查询`, async t => {
    const f = await fixture(kind, t)
    await f.hooks.resume(true)
    f.hooks.suspend(true)
    f.ledger.value = f.child
    await nextTick()
    assert.equal(f.visible.value, false)
    assert.deepEqual(f.calls, [])
    await f.hooks.resume(false)
    await f.hooks.resume(true)
    assert.deepEqual(f.calls, [['resume', false], ['resume', true]])
  })
  test(`${kind} 已挂载返回服从缓存决策，清理和加载状态传给页面会话`, async t => {
    const f = await fixture(kind, t)
    f.ledger.value = f.child
    await nextTick()
    await f.hooks.resume(true)
    f.hooks.suspend(false)
    await f.hooks.resume(false)
    assert.deepEqual(f.calls, [['resume', true], ['suspend', false], ['resume', false]])
    f.ledger.value.loading = true
    f.ledger.value.error = '模拟查询失败'
    assert.equal(f.hooks.options.loading(), true)
    assert.equal(f.hooks.options.error(), '模拟查询失败')
    f.hooks.suspend(true)
    assert.deepEqual(f.calls.at(-1), ['suspend', true])
  })
}
