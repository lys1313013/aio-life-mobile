// 隔离工程在 H5 中编译微信环图分支，复用真实首页的像素、滚动和重排回归。
// 只使用模拟接口；不能代替微信模拟器和真机验收。
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'artifacts/wechat-time-donut')
const project = path.join(output, 'project')
await mkdir(output, { recursive: true })
await rm(project, { recursive: true, force: true })
await mkdir(project)
await cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true })
await cp(path.join(root, 'scripts'), path.join(project, 'scripts'), { recursive: true })
for (const file of ['package.json', 'vite.config.js', 'index.html']) {
  await cp(path.join(root, file), path.join(project, file))
}
await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'))
for (const file of ['TimeDonut.uvue', 'GoalProgressRing.uvue']) {
  const component = path.join(project, 'src/pages/home', file)
  await writeFile(component, (await readFile(component, 'utf8')).replaceAll('MP-WEIXIN', 'WEB'))
}
const config = path.join(output, 'playwright.config.cjs')
await writeFile(config, `
const base = require(${JSON.stringify(path.join(root, 'playwright.config.js'))});
module.exports = {
  ...base,
  testDir: ${JSON.stringify(path.join(root, 'tests/e2e'))},
  testMatch: 'home-time-donut.spec.js',
  outputDir: ${JSON.stringify(path.join(output, 'results'))},
  use: { ...base.use, baseURL: 'http://127.0.0.1:5188' },
  webServer: { ...base.webServer, cwd: ${JSON.stringify(project)},
    command: 'npm run build && npm run preview -- --port 5188', url: 'http://127.0.0.1:5188' },
};
`)
const runner = spawn(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'),
  'test', '--config', config, ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, AIO_TEST_TIME_DONUT_IMAGE: '1' },
})
process.exitCode = await new Promise(resolve => runner.on('exit', code => resolve(code ?? 1)))
