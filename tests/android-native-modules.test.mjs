import assert from 'node:assert/strict';
import test from 'node:test';
import { androidModulePlan } from '../scripts/android-native-modules.mjs';
import { assertAndroidStyles } from '../scripts/check-android-styles.mjs';

test('Android Vapor selects form, debug WebSocket and both Canvas archives', () => {
  const modules = androidModulePlan(`
    vue.resolveComponent("input");
    uni.connectSocket({ url: socketUrl });
    vue.resolveComponent("canvas");
  `, {});
  for (const name of ['uni-form', 'uni-websocket', 'uni-canvas-dom2', 'uni-canvas-component']) {
    assert.ok(modules.includes(name), name);
  }
  assert.ok(!modules.includes('uni-oauth'));
});

test('Android Vapor resolves host components and preserves declared SDK dependencies', () => {
  const modules = androidModulePlan(`
    vue.resolveComponent('swiper');
    uni["scanCode"]();
  `, {
    'app-android': { distribute: { modules: { 'uni-map': {}, 'uni-websocket': {} } } },
  });
  for (const name of ['ext-component', 'uni-scanCode', 'uni-barcode-scanning', 'uni-camera',
    'uni-map-tencent', 'uni-websocket']) {
    assert.ok(modules.includes(name), name);
  }
  assert.equal(modules.length, new Set(modules).size);
});

test('Android Vapor rejects nullish results in compiled dynamic style bindings', () => {
  assert.throws(() => assertAndroidStyles(`
    vue.setSharedDataStyle(row, 8, bucket ? heat(bucket) : void 0);
    vue.setSharedDataStyle(layer, 48, preview ? revealStyle : null);
  `), /app-service\.js:2\napp-service\.js:3/);
  assert.throws(() => assertAndroidStyles('vue.setSharedDataStyle(layer, 48, undefined)'), /app-service\.js:1/);
  assert.doesNotThrow(() => assertAndroidStyles(`
    vue.setSharedDataStyle(layer, 48, preview ? revealStyle : {});
    vue.setSharedDataStyle(row, 8, cellColor(answer !== void 0));
    vue.setSharedData(layer, 9, undefined);
  `));
});
