import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createRequire } from 'node:module'
import { computed, reactive } from 'vue'
import { transformSync } from 'esbuild'
import { parse } from '@vue/compiler-sfc'
import { baseParse } from '@vue/compiler-dom'

const require = createRequire(import.meta.url)
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess')
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js')

const read = path => readFile(path, 'utf8')
const colors = JSON.parse(await read('src/theme.json'))
const source = (await read('src/services/theme.ts')).split('let initialized = false')[0]
  .replace(/^import .*\n/gm, '').replace(/export /g, '')
const { code } = transformSync(source, { loader: 'ts' })

test('Tab 页面底色服从应用设置：手动主题优先于系统，缓存页面随主题实时更新', () => {
  const { theme, pageBackgroundColor } = new Function('computed', 'reactive', 'colors',
    code + '\nreturn { theme, pageBackgroundColor };')(computed, reactive, colors)
  for (const system of ['dark', 'light']) {
    theme.system = system
    for (const mode of ['light', 'dark', 'system']) {
      theme.mode = mode
      const expected = mode === 'system' ? system : mode
      assert.equal(pageBackgroundColor.value, colors[expected].backgroundColor, `${system}/${mode}`)
    }
  }
})

test('四个 Tab 的微信背景配置位于页面首节点，同时覆盖窗口与页面根背景', async () => {
  const tabs = JSON.parse(await read('src/services/tab-bar.generated.json'))
  for (const tab of tabs) {
    const { descriptor } = parse(await read('src/' + tab.pagePath + '.uvue'))
    const nodes = baseParse(descriptor.template.content).children.filter(node => node.type === 1)
    assert.equal(nodes[0].tag, 'page-meta', tab.pagePath)
    for (const name of ['background-color', 'background-color-top', 'background-color-bottom', 'root-background-color', 'page-style']) {
      const prop = nodes[0].props.find(prop => prop.type === 7 && prop.name === 'bind' && prop.arg?.content === name)
      assert.ok(prop?.exp?.content.includes('pageBackgroundColor'), tab.pagePath + ':' + name)
    }
    assert.equal(nodes[1].tag, 'TabPage', tab.pagePath)
  }
})

async function nativeThemeLifecycle(platform) {
  const context = initScopedPreContext(platform, {}, undefined, true).preUVueContext
  const compile = async path => transformSync(preprocess(await read(path), context, { type: 'js' })
    .replace(/^import .*\n/gm, '').replace(/export /g, ''), { loader: 'ts' }).code
  const backgrounds = [], loads = [], shows = [], ticks = []
  const { theme, isDark, refreshNativeTheme } = new Function('computed', 'reactive', 'colors', 'tabs', 'uni',
    await compile('src/services/theme.ts') + '\nreturn { theme, isDark, refreshNativeTheme };')(
      computed, reactive, colors, [], {
        setBackgroundColor: ({ backgroundColor, backgroundColorTop, backgroundColorBottom }) =>
          backgrounds.push({ backgroundColor, backgroundColorTop, backgroundColorBottom }),
        setNavigationBarColor: () => {},
      })
  new Function('computed', 'nextTick', 'onLoad', 'onShow', 'isDark', 'refreshNativeTheme',
    await compile('src/services/refresh-theme.ts') + '\nuseRefreshTheme();')(
      computed, callback => ticks.push(callback), callback => loads.push(callback),
      callback => shows.push(callback), isDark, refreshNativeTheme)
  return { theme, backgrounds, loads, shows, ticks }
}

test('微信首次加载和显示立即设置当前窗口底色，不等待渲染；缓存页面读取最新主题', async () => {
  const h = await nativeThemeLifecycle('mp-weixin')
  for (const [mode, system, expected] of [
    ['light', 'dark', 'light'], ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'], ['system', 'light', 'light'],
  ]) {
    Object.assign(h.theme, { mode, system })
    for (const callbacks of [h.loads, h.shows]) {
      h.backgrounds.length = 0
      callbacks.forEach(callback => callback())
      const color = colors[expected].backgroundColor
      assert.deepEqual(h.backgrounds, [{ backgroundColor: color, backgroundColorTop: color, backgroundColorBottom: color }])
      assert.equal(h.ticks.length, 0, '原生底色不能排队到 nextTick')
    }
  }
})

test('H5 继续在页面渲染后同步原生样式，不添加微信加载钩子', async () => {
  // 只验证调度边界，不执行 H5 的 DOM/底栏 API。
  const h = await nativeThemeLifecycle('h5')
  assert.equal(h.loads.length, 0)
  h.shows.forEach(callback => callback())
  assert.equal(h.ticks.length, 1)
  assert.equal(h.backgrounds.length, 0)
})
