import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const { code } = await transform(await readFile('src/services/client-reset.ts', 'utf8'), { loader: 'ts', format: 'cjs' })
function setup(fail = false) {
  const events = [], theme = { mode: 'dark' }, module = { exports: {} }
  const uni = {
    clearStorageSync() { events.push('storage'); if (fail) throw Error('模拟清理失败') },
    getSavedFileList: options => options.success({ fileList: [{ filePath: '/saved/mock-image' }] }),
    removeSavedFile: options => { events.push(options.filePath); options.success() },
    env: { USER_DATA_PATH: '/local' },
    getFileSystemManager: () => ({
      readdirSync: () => ['aio-output-1.csv', 'bank-card-cover-1.png', 'CBTI-MOCK.png', 'system', 'other-file'],
      unlinkSync: path => events.push(path),
    }),
  }
  new Function('require', 'module', 'exports', 'uni', code)(name => {
    if (name === 'vue') return { nextTick: async () => events.push('tick') }
    if (name === './session.ts') return { clearSession: () => events.push('session') }
    if (name === './life-catalog-cache.ts') return { clearLifeCatalogCache: () => events.push('catalog') }
    if (name === './theme.ts') return { theme, refreshNativeTheme: () => events.push('theme') }
    throw Error(name)
  }, module, module.exports, uni)
  return { clear: module.exports.clearClientData, events, theme }
}
test('先使登录与旧请求失效，再清全量存储及应用生成文件，主题回到跟随系统', async () => {
  const c = setup(); await c.clear()
  assert.deepEqual(c.events, ['session', 'tick', 'catalog', 'storage', 'theme', '/saved/mock-image', '/local/aio-output-1.csv', '/local/bank-card-cover-1.png', '/local/CBTI-MOCK.png'])
  assert.equal(c.theme.mode, 'system')
})
test('存储清理失败向调用方报告，不能返回清理成功', async () => {
  const c = setup(true)
  await assert.rejects(c.clear(), /模拟清理失败/)
  assert.deepEqual(c.events, ['session', 'tick', 'catalog', 'storage'])
})
