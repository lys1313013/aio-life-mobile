// 当前锁定版本的 H5 picker 只在吸附结束时通知变化，且精确滑动整格会遗漏 onSnap。
// 保持官方滚动行为，补齐实时选择通知和卸载后的延迟回调、图片加载保护。
const fs = require('node:fs');
const path = require('node:path');

const packageDir = path.resolve(__dirname, '../node_modules/@dcloudio/uni-h5');
const version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
const pinnedVersion = '3.0.0-alpha-5030220261016001';
if (version !== pinnedVersion) {
  throw new Error(`uni-h5 ${version}: 请重新验证 picker / scroll-view / image 生命周期，并评估移除 H5 补丁。`);
}
const original = `    if (this._position !== i) {
      this._snapping = true;
      this.scrollTo(-i);
      if (isFunction(this._options.onSnap)) {
        this._options.onSnap(
          Math.round(Math.abs(this._position) / this._itemSize)
        );
      }
    }
  }
  scrollTo(position, time) {`;
const replacement = `    if (this._position !== i) {
      this._snapping = true;
      this.scrollTo(-i);
    }
    // AIO: exact-row touch movement must also commit the selected index.
    if (isFunction(this._options.onSnap)) {
      this._options.onSnap(
        Math.round(Math.abs(this._position) / this._itemSize)
      );
    }
  }
  scrollTo(position, time) {`;
// H5 picker-view emits only after its snap animation. Report the current row while the
// finger or inertia is moving so dependent time columns and the preview stay in sync.
const pickerScrollOriginal = `        spring: new Spring(2, 90, 20),
        onSnap: (index2) => {
          if (!isNaN(index2) && index2 !== state2.current) {
            state2.current = index2;
          }
        }
      });`;
const pickerScrollReplacement = `        spring: new Spring(2, 90, 20),
        onScroll: (event) => {
          const index2 = Math.round(event.target.scrollTop / indicatorHeight.value);
          if (!isNaN(index2) && index2 !== state2.current) {
            state2.current = index2;
          }
        },
        onSnap: (index2) => {
          if (!isNaN(index2) && index2 !== state2.current) {
            state2.current = index2;
          }
        }
      });`;
// uni-app x 的开发/构建入口与普通 uni-app 分离，必须覆盖 x/Vapor。
const closeOriginal = `    setTimeout(() => {
      let $picker = pickerRef.value;
      $picker.remove();
      rootRef.value.prepend($picker);
      $picker.style.display = "none";
    }, 260);`;
const closeReplacement = `    setTimeout(() => {
      let $picker = pickerRef.value;
      // AIO: the owner may unmount or reopen during the close animation.
      if (!$picker || !rootRef.value || state2.visible) return;
      $picker.remove();
      rootRef.value.prepend($picker);
      $picker.style.display = "none";
    }, 260);`;
// scroll-view 的挂载 nextTick 可能晚于条件区域卸载；不能写入已经清空的 DOM ref。
const scrollPatches = [
  ['_scrollTopChanged', 'realScrollY'], ['_scrollLeftChanged', 'realScrollX'],
].map(([name, axis]) => {
  const before = `  function ${name}(val) {\n    if (${axis}.value) {`;
  return [before, before.replace(`if (${axis}.value)`, `if (${axis}.value && main.value)`)];
});
// H5 的 VDOM image 也被 Vapor 依赖引用；图片完成时所有者可能已经卸载。
// 在回调入口停止过期事件，并保护随后排队的尺寸更新，不吞掉正常加载错误。
const imagePatches = ['onload', 'onerror'].map(event => {
  const before = `    img.${event} = (evt) => {`;
  return [before, `${before}
      // AIO: a late image callback must not access an unmounted owner.
      if (!rootRef.value || !img) {
        resetImage();
        return;
      }`];
});
imagePatches.push([
  `      nextTick(() => {
        fixSize();
      });
      img.draggable = props2.draggable;`,
  `      nextTick(() => {
        if (rootRef.value) fixSize();
      });
      img.draggable = props2.draggable;`,
]);
for (const entry of ['dist', 'dist-x', 'dist-x-vapor']) {
  const filename = path.join(packageDir, entry, 'uni-h5.es.js');
  let source = fs.readFileSync(filename, 'utf8');
  let changed = false;
  const patches = [[original, replacement], [pickerScrollOriginal, pickerScrollReplacement], [closeOriginal, closeReplacement], ...scrollPatches];
  // Vapor 自身使用 Vue 内置 image 实现；旧 image loader 仅存在于另外两个入口。
  if (entry !== 'dist-x-vapor') patches.push(...imagePatches);
  for (const [before, after] of patches) {
    if (!source.includes(after)) {
      if (source.split(before).length !== 2) {
        throw new Error(`uni-h5 ${entry} 源码与补丁不匹配，请验证组件行为后更新补丁，禁止静默跳过。`);
      }
      source = source.replace(before, after);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filename, source);
    console.log(`Applied uni-h5 ${entry} component fixes.`);
  }
}
