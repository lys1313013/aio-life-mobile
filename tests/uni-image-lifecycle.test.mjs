import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

for (const entry of ['dist', 'dist-x']) {
  function mount() {
    const source = readFileSync(new URL(`../node_modules/@dcloudio/uni-h5/${entry}/uni-h5.es.js`, import.meta.url), 'utf8')
    const loader = source.match(/function useImageLoader\([\s\S]*?\n\}\n(?=const isChrome)/)
    assert.ok(loader, '官方 image loader 结构变化，需要重新评估补丁')
    const images = [], events = [], ticks = [], appended = []
    let mounted, unmount, sizes = 0
    class Image {
      width = 24
      height = 32
      constructor() { images.push(this) }
      remove() {}
    }
    const load = vm.runInNewContext(`(${loader[0]})`, {
      Image, watch: () => {}, nextTick: fn => ticks.push(fn),
      onMounted: fn => { mounted = fn }, onBeforeUnmount: fn => { unmount = fn },
    })
    const root = { value: { appendChild: image => appended.push(image) } }
    const state = { src: 'https://example.test/fixture.png' }
    load(state, { draggable: false }, root, () => { sizes++ }, name => events.push(name))
    mounted()
    return { root, state, images, events, ticks, appended, unmount: () => unmount(), sizes: () => sizes }
  }

  test(`H5 ${entry} 图片正常加载和失败仍通知所有者`, () => {
    const h = mount()
    h.images[0].onload({})
    assert.deepEqual(h.events, ['load'])
    assert.equal(h.appended[0], h.images[0])
    assert.equal(h.state.origWidth, 24)
    h.ticks.forEach(fn => fn())
    assert.equal(h.sizes(), 1)
    const failed = mount()
    failed.images[0].onerror({})
    assert.deepEqual(failed.events, ['error'])
  })

  test(`H5 ${entry} 卸载后的图片事件及尺寸回调不访问旧节点`, () => {
    for (const event of ['onload', 'onerror']) {
      for (const reset of [false, true]) {
        const h = mount(), late = h.images[0][event]
        h.root.value = null
        if (reset) h.unmount()
        assert.doesNotThrow(() => late({}))
        assert.deepEqual(h.events, [])
        assert.deepEqual(h.appended, [])
        assert.equal(h.images[0].onload, null)
        assert.equal(h.images[0].onerror, null)
      }
    }
    const h = mount()
    h.images[0].onload({})
    h.root.value = null
    h.unmount()
    h.ticks.forEach(fn => fn())
    assert.equal(h.sizes(), 0)
  })
}
