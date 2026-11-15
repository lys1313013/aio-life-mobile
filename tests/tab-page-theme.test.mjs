import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { computed, reactive } from 'vue'
import { transformSync } from 'esbuild'
import { parse } from '@vue/compiler-sfc'
import { baseParse } from '@vue/compiler-dom'

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
