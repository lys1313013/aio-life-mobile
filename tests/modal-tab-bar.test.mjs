import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, nextTick, ref, watch } from 'vue'

// 执行真实微信脚本，只模拟窗口、键盘及原生 API，不连接业务服务器。
async function harness() {
  const source = await readFile('src/components/AdaptiveModal.uvue', 'utf8')
  const stack = [true]
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    .split('\n').filter(line => {
      const directive = line.match(/\/\/ #(ifdef|ifndef) (\S+)/)
      if (directive) {
        const matches = directive[2] === 'MP-WEIXIN'
        stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
        return false
      }
      if (line.includes('// #endif')) { stack.pop(); return false }
      return stack.at(-1)
    }).join('\n').replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*;?\n/gm, '')
  const spacing = JSON.parse(await readFile('src/styles/spacing.json', 'utf8'))
  const ui = (await readFile('src/services/mobile-ui.ts', 'utf8'))
    .replace("import spacing from '../styles/spacing.json'", `const spacing = ${JSON.stringify(spacing)}`)
  const { modalAvailableHeight } = await import(`data:text/javascript;base64,${Buffer.from(ui).toString('base64')}`)
  const js = (await transform(script, { loader: 'ts' })).code
  const cleanups = [], mounted = [], keyboardListeners = new Set()
  const windowInfo = { windowHeight: 700, safeAreaInsets: { top: 24, bottom: 0 } }
  const fixtures = {
    computed, nextTick, ref, watch, spacing, modalAvailableHeight,
    useWindowResize: () => {}, getCurrentInstance: () => ({}),
    onMounted: callback => mounted.push(callback), onUnmounted: callback => cleanups.push(callback),
    onUpdated: () => {}, provide: () => {}, defineEmits: () => () => {},
    defineProps: () => ({ label: '模拟长弹窗' }),
    withDefaults: (props, defaults) => ({ ...defaults, ...props }),
    registerModal: () => () => {},
    uni: {
      getWindowInfo: () => windowInfo,
      hideTabBar: () => assert.fail('弹窗不能隐藏原生底栏'),
      showTabBar: () => assert.fail('弹窗不能改变原生底栏状态'),
      onKeyboardHeightChange: callback => keyboardListeners.add(callback),
      offKeyboardHeightChange: callback => keyboardListeners.delete(callback),
      createSelectorQuery: () => ({ in() { return this }, select() { return this },
        boundingClientRect(callback) { callback({ height: 1200 }); return this }, exec() {} }),
    },
  }
  const component = new Function(...Object.keys(fixtures), js + '\nreturn { height, windowHeight, keyboardHeight, resize }')(...Object.values(fixtures))
  for (const callback of mounted) callback()
  await nextTick()
  return { ...component, windowInfo, keyboardListeners,
    keyboard: height => keyboardListeners.forEach(callback => callback({ height })),
    close: () => cleanups.forEach(callback => callback()),
  }
}

test('微信长弹窗使用完整视口，开关不改变窗口和底栏占位', async () => {
  const h = await harness()
  assert.equal(h.height.value, 700 - 24 - 24 * 2)
  assert.equal(h.windowHeight.value, 700)
  h.close()
  assert.equal(h.keyboardListeners.size, 0)
})

test('嵌套弹窗各自避让键盘，关闭内层不影响外层，收起后恢复高度', async () => {
  const outer = await harness(), inner = await harness()
  for (const h of [outer, inner]) {
    h.keyboard(280)
    assert.equal(h.height.value, 700 - 24 - 48 - 280)
  }
  inner.close()
  assert.equal(outer.keyboardListeners.size, 1)
  outer.keyboard(0)
  assert.equal(outer.height.value, 628)
  outer.windowInfo.windowHeight = 540
  outer.resize()
  assert.equal(outer.height.value, 468)
  outer.close()
})

test('Mobile 弹层不隐藏底栏，微信使用页面内底栏并保留四个 tab 路由', async () => {
  for (const file of ['AdaptiveModal.uvue', 'TimeEndPicker.uvue', 'ConfirmAction.uvue']) {
    const source = await readFile(`src/components/${file}`, 'utf8')
    assert.doesNotMatch(source, /registerModalTabBar|hideTabBar|showTabBar/)
  }
  const config = JSON.parse((await readFile('src/pages.json', 'utf8')).replace(/^\s*\/\/.*$/gm, ''))
  assert.equal(config.tabBar.custom, true)
  assert.deepEqual(config.tabBar.list.map(item => item.pagePath),
    ['pages/home/index', 'pages/time/index', 'pages/life/index', 'pages/profile/index'])
})
