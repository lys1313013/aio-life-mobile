import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const { code } = await transform(await readFile('src/services/mini-program-updates.ts', 'utf8'), { loader: 'ts', format: 'esm' })
const { installMiniProgramUpdates } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const userData = {
  'aio-life-mobile.access-token.v1': 'mock-token',
  'aio-life-mobile.theme.v1': 'dark',
  'aio-life-mobile.remembered-login.v1': { username: 'mock-user', password: 'mock-password' },
  'aio-life-mobile.password-vault.mock': { setting: 'mock-local-setting' },
  'aio-life-mobile.mbti.pending.mock-user': { testId: 'mock-test' },
  'mock-other-storage': 'mock-value',
}
function setup(values = userData, options = {}) {
  const storage = new Map(Object.entries(structuredClone(values))), dialogs = [], events = []
  const callbacks = {}
  const manager = {
    onUpdateReady: fn => { callbacks.ready = fn }, onUpdateFailed: fn => { callbacks.failed = fn },
    applyUpdate() {
      events.push('apply')
      if (options.failApply) throw Error('模拟重启失败')
    },
  }
  const runtime = {
    getUpdateManager: () => manager,
    getStorageSync() { throw Error('版本更新不应读取本地存储') },
    setStorageSync() { throw Error('版本更新不应写入本地存储') },
    getStorageInfoSync() { throw Error('版本更新不应读取本地存储目录') },
    removeStorageSync(key) { events.push('remove'); storage.delete(key) },
    clearStorageSync() { events.push('clear'); storage.clear() },
    showModal: modal => dialogs.push(modal),
    reLaunch: options => { events.push(options.url); options.success() },
  }
  installMiniProgramUpdates(runtime)
  return { storage, dialogs, events, callbacks, initialValues: structuredClone(values) }
}
function assertUserDataPreserved(c) {
  // 登录、主题、记住密码和任意本地数据均须原样保留。
  assert.deepEqual(Object.fromEntries(c.storage), c.initialValues)
}
test('首次安装及已有用户启动均不弹更新完成通知，不读写本地存储', () => {
  for (const values of [{}, userData, { ...userData, 'aio-life-mobile.build-seen.v1': 'mock-previous-build' }]) {
    const c = setup(values)
    assert.equal(c.dialogs.length, 0)
    assert.deepEqual(c.events, [])
    assertUserDataPreserved(c)
    assert.equal(setup(Object.fromEntries(c.storage)).dialogs.length, 0)
  }
})
test('下载完成并确认仅应用一次更新，完整保留登录与本地设置', () => {
  const c = setup()
  c.callbacks.ready(); c.callbacks.ready()
  assert.equal(c.dialogs.length, 1)
  assert.equal(c.dialogs[0].confirmText, '立即更新')
  assert.equal(c.dialogs[0].showCancel, true)
  assert.match(c.dialogs[0].content, /请先保存未提交内容/)
  assert.deepEqual(c.events, [])
  assertUserDataPreserved(c)
  c.dialogs[0].success({ confirm: true })
  c.dialogs[0].success({ confirm: true })
  c.callbacks.ready()
  assert.deepEqual(c.events, ['apply'])
  assert.equal(c.dialogs.length, 1)
  assertUserDataPreserved(c)
  const next = setup(Object.fromEntries(c.storage))
  assert.equal(next.dialogs.length, 0)
  assert.deepEqual(next.events, [])
  assertUserDataPreserved(next)
})
test('取消更新不会清数据、应用新版或反复弹窗', () => {
  const c = setup()
  c.callbacks.ready(); c.dialogs[0].success({ confirm: false }); c.callbacks.ready()
  assert.deepEqual(c.events, [])
  assert.equal(c.dialogs.length, 1)
  assertUserDataPreserved(c)
})
test('下载失败保留数据，旧确认不能应用已失效的更新', () => {
  const c = setup()
  c.callbacks.ready(); c.callbacks.failed()
  assert.equal(c.dialogs.at(-1).title, '更新失败')
  c.dialogs[0].success({ confirm: true })
  assert.deepEqual(c.events, [])
  assertUserDataPreserved(c)
})
test('应用更新失败保留数据并提示，可再次确认重试', () => {
  const options = { failApply: true }
  const c = setup(userData, options)
  c.callbacks.ready(); c.dialogs[0].success({ confirm: true })
  assert.deepEqual(c.events, ['apply'])
  assert.match(c.dialogs.at(-1).content, /重启失败/)
  assertUserDataPreserved(c)
  options.failApply = false
  c.callbacks.ready(); c.dialogs.at(-1).success({ confirm: true })
  assert.deepEqual(c.events, ['apply', 'apply'])
  assertUserDataPreserved(c)
})
test('更新弹窗展示失败不清数据，再次收到下载完成时仍可确认', () => {
  const c = setup()
  c.callbacks.ready(); c.dialogs[0].fail()
  assert.deepEqual(c.events, [])
  assertUserDataPreserved(c)
  c.callbacks.ready(); c.dialogs[1].success({ confirm: true })
  assert.deepEqual(c.events, ['apply'])
  assertUserDataPreserved(c)
})
