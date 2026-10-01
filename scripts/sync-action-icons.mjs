// 从相邻 Web 仓库的本地图标集合提取实际使用的图形；生成物随 mobile 提交，构建无需 Web 仓库。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webIcons = resolve(root, '../aio-life-front/packages/@core/base/icons/src/local-icons/generated')
const names = new Set()
const tabs = { home: 'lucide:layout-dashboard', time: 'lucide:clock', life: 'lucide:layout-grid', profile: 'lucide:user' }
for (const name of Object.values(tabs)) names.add(name)
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (entry.name.endsWith('.uvue')) {
      for (const match of readFileSync(path, 'utf8').matchAll(/\b(?:ant-design|lucide):[a-z0-9-]+/g)) names.add(match[0])
    }
  }
}
scan(resolve(root, 'src'))
const icons = {}, sources = []
for (const prefix of ['ant-design', 'lucide']) {
  const collection = JSON.parse(readFileSync(resolve(webIcons, prefix + '.json'), 'utf8'))
  sources.push({ prefix, author: collection.info.author, license: collection.info.license })
  for (const name of [...names].sort().filter(name => name.startsWith(prefix + ':'))) {
    const key = name.slice(prefix.length + 1)
    // 当前用到的图标均是原始图形；遇到未知名称或别名必须显式处理，避免生成空白图标。
    const icon = collection.icons[key]
    if (!icon) throw new Error('Web 图标不存在或需要解析别名: ' + name)
    icons[name] = { body: icon.body, width: icon.width || collection.width || 24, height: icon.height || collection.height || 24 }
  }
}
writeFileSync(resolve(root, 'src/services/icons/action-icons.json'), JSON.stringify({ sources, icons }, null, 2) + '\n')
console.log(`已同步 ${Object.keys(icons).length} 个 Web 同款图标`)

// 原生 tabBar 需要本地 PNG；用现有 Playwright 将同一 SVG 渲染为三倍分辨率资源。
if (process.argv.includes('--tabs')) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' })
  try {
    const page = await browser.newPage({ viewport: { width: 81, height: 81 } })
    for (const [tab, name] of Object.entries(tabs)) {
      const icon = icons[name]
      for (const [suffix, color] of [['', '#8b8f99'], ['-active', '#5b8ff9']]) {
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 ${icon.width} ${icon.height}">${icon.body.replaceAll('currentColor', color)}</svg>`)
        await page.screenshot({ path: resolve(root, `src/static/tabs/${tab}${suffix}.png`), omitBackground: true })
      }
    }
  } finally {
    await browser.close()
  }
  console.log('已同步 8 张底栏图标')
}
