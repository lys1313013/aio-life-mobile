// 手绘底栏 SVG 是唯一图形来源；透明 PNG 同时用于微信页面底栏和原生 tabBar。
import { readFileSync } from 'node:fs'
import { dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = file => JSON.parse(readFileSync(resolve(root, file), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
const { tabBarIcon: size } = readJson('src/styles/spacing.json')
const palettes = readJson('src/theme.json')
const { tabBar: { list: tabs } } = readJson('src/pages.json')
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 3 })
  for (const tab of tabs) {
    for (const [property, colorKey] of [['iconPath', 'tabColor'], ['selectedIconPath', 'tabSelectedColor']]) {
      const file = tab[property]
      const source = readFileSync(resolve(root, 'scripts/assets/tab-icons', basename(file, '.png') + '.svg'), 'utf8')
      for (const mode of ['light', 'dark']) {
        const svg = source.replaceAll('currentColor', palettes[mode][colorKey])
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
        const output = mode === 'dark' ? file.replace(/\.png$/, '-dark.png') : file
        await page.locator('svg').screenshot({ path: resolve(root, 'src', output), omitBackground: true })
      }
    }
  }
} finally {
  await browser.close()
}
console.log(`已生成 ${tabs.length * 4} 张手绘底栏图标（深浅色 × 未选中/选中）`)
