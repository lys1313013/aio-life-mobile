import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js')
const source = await readFile(new URL('../src/pages/finance/cards.uvue', import.meta.url), 'utf8')
const spacing = JSON.parse(await readFile(new URL('../src/styles/spacing.json', import.meta.url), 'utf8'))
const card = { id: '9223372036854775807', cardNoLast4: '1234' }

function fixture(platform) {
  const context = initScopedPreContext(platform, {}, undefined, true).preUVueContext
  const script = preprocess(source.split('<script setup lang="ts">')[1].split('</script>')[0], context, { type: 'js' })
  const menu = script.slice(script.indexOf('const menuLeft ='), script.indexOf('let alive = true,'))
  const { code } = transformSync(menu, { loader: 'ts', format: 'cjs' })
  let callback, selected, scope
  const proxy = {}, menuCardId = { value: '' }, cardSwitchPhase = { value: 'idle' }
  const query = { in(value) { scope = value; return query }, select(value) { selected = value; return query }, boundingClientRect(value) { callback = value; return query }, exec() {} }
  const api = new Function('uni', 'spacing', 'ref', 'getCurrentInstance', 'order', 'cardSwitchPhase', 'menuCardId', `
    let alive = true;
    ${code}
    return { toggleMenu, menuLeft, menuTop, leave: () => { alive = false } };
  `)({ createSelectorQuery: () => query, getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }) }, spacing, value => ({ value }), () => ({ proxy }), { clickBlocked: () => false }, cardSwitchPhase, menuCardId)
  return { ...api, menuCardId, cardSwitchPhase, measured: value => callback(value), selected: () => selected, scope: () => scope, proxy }
}

for (const platform of ['mp-weixin', 'h5']) {
  test(`${platform} 按钮测量为空仍能打开菜单，长 ID 不丢失`, () => {
    const f = fixture(platform)
    f.toggleMenu(card, { detail: { x: 342, y: 780 } })
    f.measured(null)
    assert.equal(f.menuCardId.value, card.id)
    assert.ok(f.menuLeft.value >= spacing.overlayInline)
    assert.ok(f.menuLeft.value + 168 <= 390 - spacing.overlayInline)
    assert.ok(f.menuTop.value < 780)
    assert.equal(f.scope(), f.proxy)
    assert.equal(f.selected(), (platform === 'mp-weixin' ? '.card-menu-control >>> ' : '') + '#card-more-' + card.id)
  })
  test(`${platform} 测量成功后贴近按钮，关闭后延迟回调不能重开菜单`, () => {
    const f = fixture(platform)
    f.toggleMenu(card, { clientX: 350, clientY: 300 })
    f.measured({ right: 370, top: 260, bottom: 304 })
    assert.equal(f.menuLeft.value, 202)
    assert.equal(f.menuTop.value, 304 + spacing.detail)
    f.toggleMenu(card, {})
    f.measured({ right: 200, top: 100, bottom: 144 })
    assert.equal(f.menuCardId.value, '')
    assert.equal(f.menuLeft.value, 202)
  })
  test(`${platform} 离页后测量失效，类型切换期间不打开菜单`, () => {
    const f = fixture(platform)
    f.toggleMenu(card, {})
    const left = f.menuLeft.value
    f.leave()
    f.measured({ right: 200, top: 100, bottom: 144 })
    assert.equal(f.menuLeft.value, left)
    f.menuCardId.value = ''
    f.cardSwitchPhase.value = 'in'
    f.toggleMenu(card, {})
    assert.equal(f.menuCardId.value, '')
  })
}
