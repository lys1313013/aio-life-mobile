// 当前锁定版本的 H5 picker 在精确滑动整格时遗漏 onSnap。
// 保持官方组件与触摸行为，补齐选择通知和卸载后的延迟回调保护。
const fs = require('node:fs');
const path = require('node:path');

const packageDir = path.resolve(__dirname, '../node_modules/@dcloudio/uni-h5');
const version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
const pinnedVersion = '3.0.0-alpha-5030120260930001';
if (version !== pinnedVersion) {
  throw new Error(`uni-h5 ${version}: 请重新验证 picker / scroll-view 生命周期，并评估移除 H5 补丁。`);
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
for (const entry of ['dist', 'dist-x', 'dist-x-vapor']) {
  const filename = path.join(packageDir, entry, 'uni-h5.es.js');
  let source = fs.readFileSync(filename, 'utf8');
  let changed = false;
  for (const [before, after] of [[original, replacement], [closeOriginal, closeReplacement], ...scrollPatches]) {
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
