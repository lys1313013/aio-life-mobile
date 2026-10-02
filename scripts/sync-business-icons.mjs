// 按实际引用同步 Web 菜单、分类预设和 mobile 图标。生成物提交到 mobile，构建和运行均无需 Web 或网络。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const web = resolve(root, '../aio-life-front')
const requireWeb = createRequire(resolve(web, 'package.json'))
const svgDirectory = resolve(web, 'packages/icons/src/svg/icons')
const icons = {}
for (const file of readdirSync(svgDirectory).filter(file => file.endsWith('.svg')).sort()) {
  const source = readFileSync(resolve(svgDirectory, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const match = source.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/)
  if (!match) throw new Error(`无效的 SVG: ${file}`)
  const attributes = [...match[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)]
  const viewBox = attributes.find(attr => attr[1] === 'viewBox')?.[3].trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0)
    throw new Error(`SVG 缺少有效 viewBox: ${file}`)
  const [left, top, width, height] = viewBox
  // 保留根样式、命名空间和内部 defs，避免填充图标或品牌图形变形。
  const inherited = attributes.filter(attr => !['width', 'height', 'viewBox', 'version'].includes(attr[1])).map(attr => attr[0]).join(' ')
  icons[`svg:${file.slice(0, -4)}`] = { body: `<g ${inherited}>${match[2].trim()}</g>`, left, top, width, height }
}
const config = readFileSync(resolve(web, 'apps/web-antd/src/views/my-hub/exercise/category-config/config.ts'), 'utf8')
const exercisePresets = [...new Set([...config.matchAll(/\{ icon: '([^']+)' \}/g)].map(match => match[1]))]
const availableCollections = requireWeb('@iconify/json/collections.json')
const names = new Set(exercisePresets)
const legacy = JSON.parse(readFileSync(resolve(root, 'src/services/icons/category-icons.json'), 'utf8')).icons
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (/\.(ts|vue|uvue)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      for (const match of readFileSync(path, 'utf8').matchAll(/(['"`])([a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*)\1/g)) {
        const prefix = match[2].split(':')[0]
        // 排除 action:* 路由和 update:* 事件；保留所有 Iconify 集合与自定义图标引用。
        if (availableCollections[prefix] || prefix === 'svg' || prefix === 'platform') names.add(match[2])
      }
    }
  }
}
scan(resolve(root, 'src'))
scan(resolve(web, 'apps/web-antd/src/router/routes'))
scan(resolve(web, 'apps/web-antd/src/constants'))
const webConfig = JSON.parse(readFileSync(resolve(web, 'scripts/icons/local-icons.config.json'), 'utf8'))
for (const name of webConfig.icons) names.add(name)
const collections = new Map()
for (const name of [...names].sort()) {
  if (icons[name]) continue
  const [prefix, key] = name.split(':')
  if (prefix === 'platform' && legacy[name]) continue
  if (!collections.has(prefix)) collections.set(prefix, requireWeb(`@iconify/json/json/${prefix}.json`))
  const collection = collections.get(prefix)
  let icon = collection.icons[key]
  const alias = collection.aliases?.[key]
  if (!icon && alias && Object.keys(alias).length === 1) icon = collection.icons[alias.parent]
  if (!icon) throw new Error(`缺失图标或需要处理别名变换: ${name}`)
  icons[name] = { ...icon, width: icon.width || collection.width || 24, height: icon.height || collection.height || 24 }
}
if (!exercisePresets.length) throw new Error('未找到 Web 运动预设')
const sources = [...collections.values()].map(({ prefix, info }) => ({ prefix, author: info.author, license: info.license }))
const output = JSON.stringify({ sources, exercisePresets, icons }, null, 2) + '\n'
const target = resolve(root, 'src/services/icons/business-icons.json')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('业务图标已变化，请执行 npm run icons:sync')
} else writeFileSync(target, output)
console.log(`业务图标 ${Object.keys(icons).length} 个，覆盖 ${collections.size} 个 Iconify 集合，运动预设 ${exercisePresets.length} 个`)
