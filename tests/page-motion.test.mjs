import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const tabSource = await readFile('src/services/tab-bar.generated.json', 'utf8')
const source = (await readFile('src/services/page-motion.ts', 'utf8'))
  .split('// #ifdef WEB\nlet installed')[0].replace(/^import .*\n/gm, '').replace(/export /g, '')
const { code } = await transform(source, { loader: 'ts' })
function harness(routes = []) {
  return new Function('tabs', 'getCurrentPages', code + '\nreturn { pageMotionDirection, configurePageMotion };')(
    JSON.parse(tabSource), () => routes.map(route => ({ route })))
}

test('所有业务链路的前进、原路返回及浏览器历史方向一致，底部Tab平级切换不接管', () => {
  const { pageMotionDirection: direction } = harness()
  const root = '/pages/profile/index', account = '/pages/profile/account-security', binding = '/pages/profile/bindings'
  assert.equal(direction(account, root, 2, 2), 'forward')
  assert.equal(direction(binding, account, 3, 3), 'forward')
  assert.equal(direction(account, binding, 2, 3), 'back')
  assert.equal(direction(root, account, 2, 2, 'navigateBack'), 'back')
  assert.equal(direction('/pages/profile/preferences?section=menus', account, 3, 3), 'forward')
  assert.equal(direction('/pages/time/index', root, 2, 2), '')
  assert.equal(direction('/pages/finance/index', account, 2, 2), 'forward')
  assert.equal(direction(account, account, 2, 2), '')
  assert.equal(direction('/pages/tasks/goals', '/pages/life/index', 2, 2), 'forward')
  assert.equal(direction('/pages/life/index', '/pages/tasks/goals', 2, 3), 'back')
  assert.equal(direction('/pages/finance/income', '/pages/finance/index', 3, 3), 'forward')
  assert.equal(direction('/pages/finance/index', '/pages/finance/income', 3, 4), 'back')
  assert.equal(direction('/pages/goods/devices', '/', 2, 2), 'forward')
  assert.equal(direction('/', '/pages/goods/devices', 2, 3), 'back')
  assert.equal(direction('/pages/records/library?mode=reading', '/pages/records/library?mode=movie', 2, 2), '')
})

test('App成对导航扩展到业务页并保留显式参数，Tab与重置导航不添加层级动效', () => {
  const { configurePageMotion: configure } = harness(['pages/profile/index', 'pages/profile/account-security'])
  const push = { url: '/pages/profile/bindings' }
  configure('navigateTo', push)
  assert.equal(push.animationType, 'pop-in')
  assert.equal(push.animationDuration, 360)
  const back = { delta: 1 }
  configure('navigateBack', back)
  assert.equal(back.animationDuration, 360)
  assert.equal(back.animationType, undefined)
  const custom = { url: '/pages/profile/settings', animationDuration: 500, animationType: 'fade-in' }
  configure('navigateTo', custom)
  assert.equal(custom.animationDuration, 500)
  assert.equal(custom.animationType, 'fade-in')
  const tab = { url: '/pages/profile/index' }, business = { url: '/pages/finance/index' }
  configure('switchTab', tab)
  configure('navigateTo', business)
  assert.equal(tab.animationDuration, undefined)
  assert.equal(business.animationDuration, 360)
  const reset = { url: '/pages/tasks/goals' }
  configure('reLaunch', reset)
  assert.equal(reset.animationDuration, undefined)
  const loggedOut = harness(['pages/login/index']).configurePageMotion
  const login = { url: '/pages/profile/index' }
  loggedOut('navigateTo', login)
  assert.equal(login.animationDuration, undefined)
})

test('登录鉴权、页面内参数切换、重定向和导航栈重置不播放推入', () => {
  const { pageMotionDirection: direction } = harness()
  for (const method of ['switchTab', 'redirectTo', 'reLaunch']) {
    assert.equal(direction('/pages/tasks/goals', '/pages/finance/income', 5, 5, method), '')
  }
  for (const path of ['/pages/login/index', '/pages/auth/index', '/unknown']) {
    assert.equal(direction('/pages/tasks/goals', path, 5, 5), '')
    assert.equal(direction(path, '/pages/tasks/goals', 5, 5), '')
  }
})

test('当前登记的所有业务路由自动覆盖，新增分包不再依赖手工白名单', async () => {
  const config = JSON.parse((await readFile('src/pages.json', 'utf8')).replace(/^\s*\/\/.*$/gm, ''))
  const paths = [...config.pages.map(page => page.path), ...config.subPackages.flatMap(pkg => pkg.pages.map(page => pkg.root + '/' + page.path))]
  const { pageMotionDirection: direction } = harness()
  const tabs = JSON.parse(tabSource).map(tab => tab.pagePath)
  for (const path of paths.filter(path => !tabs.includes(path) && !['pages/login/index', 'pages/auth/index'].includes(path))) {
    assert.equal(direction('/' + path, '/pages/life/index', 2, 2), 'forward', path)
    assert.equal(direction('/pages/life/index', '/' + path, 2, 3), 'back', path)
  }
})
