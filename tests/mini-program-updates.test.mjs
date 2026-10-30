import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const { code } = await transform(await readFile('src/services/mini-program-updates.ts', 'utf8'), { loader: 'ts', format: 'esm' })
const { installMiniProgramUpdates, buildSeenKey, updateCleanedKey } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const flush = () => new Promise(resolve => setImmediate(resolve))
function setup(values = {}, build = 'new-build', failClear = false) {
  const storage = new Map(Object.entries(values)), dialogs = [], events = []
  const callbacks = {}
  const manager = {
    onUpdateReady: fn => { callbacks.ready = fn }, onUpdateFailed: fn => { callbacks.failed = fn },
    applyUpdate: () => { events.push('apply'); assert.equal(storage.has('aio-life-mobile.access-token.v1'), false) },
  }
  const runtime = {
    getUpdateManager: () => manager,
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    showModal: modal => dialogs.push(modal), reLaunch: options => { events.push(options.url); options.success() },
  }
  installMiniProgramUpdates(runtime, build, async () => {
    events.push('clear')
    if (failClear) throw Error('模拟存储失败')
    storage.clear()
  })
  return { storage, dialogs, events, callbacks }
}
test('首次安装与同一构建不提示；升级后的已有用户得到清理提示', () => {
  assert.equal(setup().dialogs.length, 0)
  assert.equal(setup({ [buildSeenKey]: 'new-build' }).dialogs.length, 0)
  const upgraded = setup({ 'aio-life-mobile.access-token.v1': 'mock-token' })
  assert.equal(upgraded.dialogs[0].title, '已更新到新版本')
  assert.deepEqual(upgraded.events, [])
})
test('已进入新版：稍后不清数据；确认清理后返回登录并记住本次构建', async () => {
  const c = setup({ [buildSeenKey]: 'old-build', 'aio-life-mobile.access-token.v1': 'mock-token' })
  c.dialogs[0].success({ confirm: false })
  assert.deepEqual(c.events, [])
  const confirmed = setup({ [buildSeenKey]: 'old-build' })
  confirmed.dialogs[0].success({ confirm: true })
  await flush()
  assert.deepEqual(confirmed.events, ['clear', '/pages/login/index'])
  assert.equal(confirmed.storage.get(buildSeenKey), 'new-build')
})
test('下载完成后先清理再应用更新；下次启动不重复清理提示', async () => {
  const c = setup({ [buildSeenKey]: 'new-build', 'aio-life-mobile.access-token.v1': 'mock-token' })
  c.callbacks.ready(); c.callbacks.ready()
  assert.equal(c.dialogs.length, 1)
  assert.equal(c.dialogs[0].confirmText, '清理更新')
  assert.deepEqual(c.events, [])
  c.dialogs[0].success({ confirm: true })
  await flush()
  assert.deepEqual(c.events, ['clear', 'apply'])
  assert.equal(c.storage.get(updateCleanedKey), true)
  const next = setup(Object.fromEntries(c.storage), 'next-build')
  assert.equal(next.dialogs.length, 0)
  assert.equal(next.storage.get(buildSeenKey), 'next-build')
  assert.equal(next.storage.has(updateCleanedKey), false)
})
test('取消更新和下载失败不会清数据；清理失败不会应用新版', async () => {
  const c = setup()
  c.callbacks.ready(); c.dialogs[0].success({ confirm: false })
  assert.deepEqual(c.events, [])
  c.callbacks.failed()
  assert.deepEqual(c.events, [])
  const failed = setup({}, 'new-build', true)
  failed.callbacks.ready(); failed.dialogs[0].success({ confirm: true })
  await flush()
  assert.deepEqual(failed.events, ['clear'])
  assert.equal(failed.storage.has(updateCleanedKey), false)
  assert.match(failed.dialogs.at(-1).content, /未完成/)
})
test('启动提示期间完成下载不叠弹窗，关闭后提供待应用版本', () => {
  const c = setup({ [buildSeenKey]: 'old-build' })
  c.callbacks.ready()
  assert.equal(c.dialogs.length, 1)
  c.dialogs[0].success({ confirm: false })
  assert.equal(c.dialogs[1].title, '新版本已准备好')
})
