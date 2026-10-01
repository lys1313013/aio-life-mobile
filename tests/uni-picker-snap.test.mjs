import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// 对安装包中实际执行的 snap 方法回归，而非复制一份修复实现。
for (const entry of ['dist', 'dist-x', 'dist-x-vapor']) {
  test(`H5 ${entry} 取消后立即卸载或重开不会运行过期清理`, () => {
    const source = readFileSync(new URL(`../node_modules/@dcloudio/uni-h5/${entry}/uni-h5.es.js`, import.meta.url), 'utf8');
    const callback = source.match(/setTimeout\(\(\) => \{\n      let \$picker = pickerRef.value;([\s\S]*?)\n    \}, 260\);/);
    assert.ok(callback, '官方 picker 延迟关闭结构变化，需重新评估补丁');
    for (const state of ['unmounted', 'reopened', 'closing']) {
      const actions = [];
      const picker = { remove: () => actions.push('remove'), style: { display: 'block' } };
      const root = { prepend: () => actions.push('prepend') };
      const close = vm.runInNewContext(`(function () { let $picker = pickerRef.value; ${callback[1]} })`, {
        pickerRef: { value: state === 'unmounted' ? null : picker },
        rootRef: { value: state === 'unmounted' ? null : root },
        state2: { visible: state === 'reopened' },
      });
      assert.doesNotThrow(close);
      assert.deepEqual(actions, state === 'closing' ? ['remove', 'prepend'] : []);
      assert.equal(picker.style.display, state === 'closing' ? 'none' : 'block');
    }
  });
  test(`H5 ${entry} 触摸恰好整格也提交选中索引，非整格仍吸附`, () => {
    const source = readFileSync(new URL(`../node_modules/@dcloudio/uni-h5/${entry}/uni-h5.es.js`, import.meta.url), 'utf8');
    const method = source.match(/  snap\(\) \{([\s\S]*?)\n  \}\n  scrollTo\(position, time\)/);
    assert.ok(method, '官方 snap 方法结构变化，需重新评估补丁');
    const snap = vm.runInNewContext(`(function () {${method[1]}\n})`, { isFunction: (value) => typeof value === 'function' });
    for (const [position, index, adjusted] of [[-34, 1, false], [-68, 2, false], [-38, 1, true], [-56, 2, true], [0, 0, false]]) {
      const notified = [];
      const scrolls = [];
      const scroller = {
        _position: position, _itemSize: 34,
        _options: { onSnap: (value) => notified.push(value) },
        scrollTo(value) { scrolls.push(value); this._position = -value; },
      };
      snap.call(scroller);
      assert.deepEqual(notified, [index], `position=${position}`);
      assert.equal(scrolls.length, adjusted ? 1 : 0);
      assert.equal(Math.abs(scroller._position), index * 34);
    }
  });
}
