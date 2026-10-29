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
      .replace(/import \{ onLoad, onShow \}[^\n]+/, `const onLoad = callback => globalThis[${JSON.stringify(key)}].load = callback; const onShow = callback => globalThis[${JSON.stringify(key)}].show = callback;`)
      .replace(/from 'vue'/g, `from ${JSON.stringify(vueURL)}`)
      .replace(/import \{ useDomainPage \}[^\n]+/, domainImport)
    source = source.replace("'./services/use-ledger-page.ts'", JSON.stringify(moduleURL(helper)))
  }
  source = source.replace(/from 'vue'/g, `from ${JSON.stringify(vueURL)}`)
    .replace(/import \{ useDomainPage \}[^\n]+/, domainImport)
    .replace(/import Ledger[^\n]+/g, '')
  const lines = source.split('\n')
  const imports = lines.filter(line => line.startsWith('import ')).join('\n')
  const body = lines.filter(line => !line.startsWith('import ')).join('\n')
  const { setup } = await import(moduleURL(`${imports}\nexport function setup() {\n${body}\nreturn { mounted, visible, ledger, initialCreate, awaitingLedger };\n}`))
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
    assert.equal(f.awaitingLedger.value, true)
    assert.deepEqual(f.calls, [])
    f.ledger.value = f.child
    await nextTick()
    assert.deepEqual(f.calls, [['resume', true]])
    assert.equal(f.awaitingLedger.value, false)
    assert.deepEqual(f.hooks.options.keys(), [kind, 'userDictData', 'userDictType'])
  })
  test(`${kind} 首次仅恢复活动状态不撤占位，直到真实查询同步启动`, async t => {
    const f = await fixture(kind, t)
    f.ledger.value = f.child
    await nextTick()
    await f.hooks.resume(false)
    assert.equal(f.awaitingLedger.value, true)
    f.ledger.value.resume = refresh => {
      assert.equal(f.awaitingLedger.value, true)
      f.ledger.value.loading = refresh
    }
    const started = f.hooks.resume(true)
    assert.equal(f.ledger.value.loading, true)
    assert.equal(f.awaitingLedger.value, false)
    await started
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
    assert.equal(f.awaitingLedger.value, false)
    await f.hooks.resume(false)
    assert.deepEqual(f.calls, [['resume', true], ['suspend', false], ['resume', false]])
    f.ledger.value.loading = true
    f.ledger.value.error = '模拟查询失败'
    assert.equal(f.hooks.options.loading(), true)
    assert.equal(f.hooks.options.error(), '模拟查询失败')
    f.hooks.suspend(true)
    assert.equal(f.awaitingLedger.value, true)
    assert.deepEqual(f.calls.at(-1), ['suspend', true])
  })
  test(`${kind} 同会话返回初始化期间保留页面，权限清理立即隐藏`, async t => {
    const f = await fixture(kind, t)
    f.ledger.value = f.child
    await nextTick()
    await f.hooks.resume(true)
    f.hooks.suspend(false)
    f.hooks.show()
    assert.equal(f.visible.value, true)
    assert.equal(f.awaitingLedger.value, false)
    assert.equal(f.calls.filter(([action]) => action === 'resume').length, 1)
    f.hooks.suspend(true)
    assert.equal(f.visible.value, false)
    assert.equal(f.awaitingLedger.value, true)
  })
}

test('首页记一笔参数保留到挂载，跨账号清理不重新打开编辑器', async t => {
  const f = await fixture('expense', t)
  f.hooks.load({ create: '1' })
  assert.equal(f.initialCreate.value, true)
  f.hooks.suspend(false)
  assert.equal(f.initialCreate.value, true)
  f.hooks.suspend(true)
  assert.equal(f.initialCreate.value, false)
})
