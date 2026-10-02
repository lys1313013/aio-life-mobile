import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transform } from 'esbuild'
import { reactive, watch } from 'vue'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../src/services/life-catalog-cache.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'cjs' })
const catalog = [{ menuId: '9223372036854775807', title: '阅读', path: '/record/read', parentTitle: '生活', ancestors: [{ menuId: '1', title: '生活' }] }]
function setup(storage = new Map(), broken = false) {
  const session = reactive({ token: '' })
  const module = { exports: {} }
  const uni = {
    getStorageSync(key) { if (broken) throw Error('storage'); return structuredClone(storage.get(key)) },
    setStorageSync(key, value) { if (broken) throw Error('storage'); storage.set(key, structuredClone(value)) },
    removeStorageSync(key) { if (broken) throw Error('storage'); storage.delete(key) },
  }
  new Function('require', 'module', 'exports', 'uni', code)(name => {
    if (name === 'vue') return { watch }
    if (name === './session.ts') return { session }
    return require(name)
  }, module, module.exports, uni)
  return { ...module.exports, session, storage }
}

test('重启恢复同一登录目录，刷新覆盖本地数据，空目录也能恢复', () => {
  const first = setup()
  first.session.token = 'account-a'
  first.cacheLifeCatalog(catalog, 'account-a')
  assert.equal(first.readCachedLifeCatalog(), catalog)
  assert.ok(!JSON.stringify([...first.storage]).includes('account-a'))
  const restart = setup(first.storage)
  assert.equal(restart.readCachedLifeCatalog(), null)
  restart.session.token = 'account-a'
  assert.deepEqual(restart.readCachedLifeCatalog(), catalog)
  restart.cacheLifeCatalog([], 'account-a')
  const again = setup(first.storage)
  again.session.token = 'account-a'
  assert.deepEqual(again.readCachedLifeCatalog(), [])
})

test('异账号不读取缓存，切换或退出清理，旧请求不能写回', () => {
  const c = setup()
  c.session.token = 'account-a'
  c.cacheLifeCatalog(catalog, 'account-a')
  const other = setup(c.storage)
  other.session.token = 'account-b'
  assert.equal(other.readCachedLifeCatalog(), null)
  c.session.token = 'account-b'
  assert.equal(c.storage.size, 0)
  c.cacheLifeCatalog(catalog, 'account-a')
  assert.equal(c.readCachedLifeCatalog(), null)
  c.cacheLifeCatalog(catalog, 'account-b')
  c.session.token = ''
  assert.equal(c.readCachedLifeCatalog(), null)
  assert.equal(c.storage.size, 0)
})

test('清除缓存同时移除内存及持久化目录', () => {
  const c = setup()
  c.session.token = 'account-a'
  c.cacheLifeCatalog(catalog, 'account-a')
  c.clearLifeCatalogCache()
  assert.equal(c.readCachedLifeCatalog(), null)
  assert.equal(c.storage.size, 0)
})

test('损坏缓存回退请求，存储异常仍能使用内存', () => {
  const c = setup()
  c.session.token = 'account-a'
  c.cacheLifeCatalog(catalog, 'account-a')
  const key = [...c.storage.keys()][0]
  for (const invalid of [null, {}, [null], [{ ...catalog[0], menuId: 123 }], [{ ...catalog[0], ancestors: null }]]) {
    const stored = c.storage.get(key)
    c.storage.set(key, { ...stored, catalog: invalid })
    const restart = setup(c.storage)
    restart.session.token = 'account-a'
    assert.equal(restart.readCachedLifeCatalog(), null)
  }
  const broken = setup(new Map(), true)
  broken.session.token = 'account-a'
  assert.equal(broken.readCachedLifeCatalog(), null)
  broken.cacheLifeCatalog(catalog, 'account-a')
  assert.equal(broken.readCachedLifeCatalog(), catalog)
  broken.clearLifeCatalogCache()
  assert.equal(broken.readCachedLifeCatalog(), null)
})
