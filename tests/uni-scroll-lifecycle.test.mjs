import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

// 执行安装包的真实函数，验证首页解锁/离页时先卸载、后 nextTick 的顺序。
for (const entry of ['dist', 'dist-x', 'dist-x-vapor']) {
  test(`H5 ${entry} 延迟滚动初始化不访问已卸载 DOM，正常滚动与动画保留`, () => {
    const source = readFileSync(new URL(`../node_modules/@dcloudio/uni-h5/${entry}/uni-h5.es.js`, import.meta.url), 'utf8')
    for (const [name, axis, field] of [['_scrollTopChanged', 'y', 'scrollTop'], ['_scrollLeftChanged', 'x', 'scrollLeft']]) {
      const match = source.match(new RegExp(`  function ${name}\\(val\\) \\{([\\s\\S]*?)\\n  \\}\\n  function`))
      assert.ok(match, '官方滚动结构变化，需要重新评估补丁')
      const main = { value: { scrollTop: 0, scrollLeft: 0 } }, props = { scrollWithAnimation: false }, animations = []
      const enabled = { value: true }
      const update = vm.runInNewContext(`(function (val) {${match[1]} })`, {
        main, props2: props, realScrollY: enabled, realScrollX: enabled,
        scrollTo2: (value, direction) => animations.push([value, direction]),
      })
      update(42);assert.equal(main.value[field], 42)
      props.scrollWithAnimation = true;update(80);assert.deepEqual(animations, [[80, axis]])
      main.value = null;assert.doesNotThrow(() => update(100));assert.equal(animations.length, 1)
      props.scrollWithAnimation = false;assert.doesNotThrow(() => update(100))
      main.value = { scrollTop: 0, scrollLeft: 0 };enabled.value = false;update(100);assert.equal(main.value[field], 0)
    }
  })
}
