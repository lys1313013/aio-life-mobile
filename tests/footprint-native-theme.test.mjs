import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';
import { computed, effectScope, nextTick, onScopeDispose, reactive, ref, watch } from 'vue';

// 只验证传给微信原生地图的配置及生命周期，不模拟或声称验证腾讯底图颜色。
const source = (await readFile('src/pages/life-footprints/native-map-theme.ts', 'utf8'))
  .replace(/^import .*\n/gm, '').replace('export function', 'function');
const { code } = await transform(source, { loader: 'ts' });
const create = new Function('nextTick', 'onScopeDispose', 'ref', 'watch', 'isDark', 'theme',
  code + '\nreturn useNativeMapTheme();');
const flush = async () => { await nextTick(); await nextTick(); };

function harness(mode, system) {
  const theme = reactive({ mode, system });
  const isDark = computed(() => (theme.mode === 'system' ? theme.system : theme.mode) === 'dark');
  const scope = effectScope();
  const map = scope.run(() => create(nextTick, onScopeDispose, ref, watch, isDark, theme));
  const patches = [];
  scope.run(() => watch(map.setting, value => patches.push({ ...value }), { flush: 'sync' }));
  return { ...map, theme, patches, close: () => scope.stop() };
}

test('地图首次创建后按小程序选择重新下发开关，覆盖与宿主相反的配置场景', async () => {
  for (const [mode, system, expected] of [['light', 'dark', false], ['dark', 'light', true]]) {
    const h = harness(mode, system);
    h.updated();
    await flush();
    assert.deepEqual(h.patches, [{}, { enableDarkMode: expected }]);
    const count = h.patches.length;
    h.updated();
    await flush();
    assert.equal(h.patches.length, count, '配置更新触发 updated 时不能进入循环');
    h.close();
  }
});

test('手动主题切换及跟随系统切换均更新地图，配置不重置中心和缩放', async () => {
  const h = harness('light', 'light');
  h.updated(); await flush();
  h.theme.mode = 'dark'; await flush();
  assert.deepEqual(h.setting.value, { enableDarkMode: true });
  h.theme.mode = 'system'; await flush();
  assert.deepEqual(h.setting.value, { enableDarkMode: false });
  h.theme.system = 'dark'; await flush();
  assert.deepEqual(h.setting.value, { enableDarkMode: true });
  h.close();
});

test('手动浅色时宿主切深色、返回页面仍重新下发浅色开关', async () => {
  const h = harness('light', 'light');
  h.updated(); await flush();
  h.patches.length = 0;
  h.theme.system = 'dark'; await flush();
  assert.deepEqual(h.patches, [{}, { enableDarkMode: false }]);
  h.patches.length = 0;
  await h.sync(); await flush();
  assert.deepEqual(h.patches, [{}, { enableDarkMode: false }]);
  h.close();
});

test('连续主题变化使用最新状态，卸载后停止补发', async () => {
  const h = harness('light', 'dark');
  h.updated();
  h.theme.mode = 'dark';
  h.theme.mode = 'light';
  await flush();
  assert.deepEqual(h.setting.value, { enableDarkMode: false });
  const pending = h.sync();
  h.close();
  const count = h.patches.length;
  await pending;
  h.theme.mode = 'dark'; await flush();
  assert.equal(h.patches.length, count);
});
