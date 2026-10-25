import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { computed, ref } from 'vue';
import { transformSync } from 'esbuild';
const read = file => fs.readFileSync(file, 'utf8');
const tabs = JSON.parse(read('src/services/tab-bar.generated.json'));
function harness(pagePath = 'pages/time/index') {
  const pending = [], toasts = [];
  const source = read('src/services/weixin-tab-bar.ts').replace(/^import[^\n]+\n/gm, '').replace(/export /g, '');
  const navigation = new Function('ref', 'tabs', 'uni', transformSync(source, { loader: 'ts' }).code + '\nreturn useTabNavigation')
    (ref, tabs, { switchTab: options => pending.push(options), showToast: options => toasts.push(options) })(pagePath);
  return { ...navigation, pending, toasts };
}

test('四个 tab 从当前页切换，当前项/非法项无请求，连续点击只发一次', () => {
  for (const [index, tab] of tabs.entries()) {
    const h = harness(tab.pagePath);
    h.switchTab(index); h.switchTab(-1); h.switchTab(4);
    assert.equal(h.pending.length, 0);
    const target = (index + 1) % tabs.length;
    h.switchTab(target); h.switchTab((index + 2) % tabs.length);
    assert.equal(h.pending.length, 1);
    assert.equal(h.pending[0].url, '/' + tabs[target].pagePath);
    assert.equal(h.switching.value, true);
    h.pending[0].complete();
    assert.equal(h.switching.value, false);
  }
});

test('切换失败反馈且可以重试；高亮始终取页面路由，无提前改选中状态', () => {
  const h = harness();
  h.switchTab(2); h.pending[0].fail(); h.pending[0].complete();
  assert.equal(h.toasts.length, 1);
  h.switchTab(2);
  assert.equal(h.pending.length, 2);
  assert.match(read('src/components/PageTabBar.uvue'), /item.pagePath === pagePath/);
});

test('嵌套弹窗登记只控制原生画布，重复释放不会提前恢复背景', () => {
  const source = read('src/services/modal-presence.ts').replace(/^import[^\n]+\n/gm, '').replace(/export /g, '');
  const registry = new Function('computed', 'ref', transformSync(source, { loader: 'ts' }).code + '\nreturn {registerModal, modalOpen}')(computed, ref);
  const outer = registry.registerModal(), inner = registry.registerModal();
  assert.equal(registry.modalOpen.value, true);
  inner(); inner();
  assert.equal(registry.modalOpen.value, true);
  outer(); outer();
  assert.equal(registry.modalOpen.value, false);
});

test('四个微信 tab 共用页面容器：底栏在文档流，弹层全屏且无底栏重复遮罩', () => {
  for (const tab of tabs) {
    const page = read('src/' + tab.pagePath + '.uvue');
    assert.match(page, new RegExp('<TabPage page-path="' + tab.pagePath + '">'));
    assert.doesNotMatch(page, /tabPageStyle|useTabPage/);
  }
  const shell = read('src/components/TabPage.uvue');
  assert.match(shell, /<slot \/>/);
  assert.match(shell, /<PageTabBar/);
  const bar = read('src/components/PageTabBar.uvue');
  assert.doesNotMatch(bar, /mask|blur|padding-top|position: fixed/);
  assert.match(bar, /padding-bottom: env\(safe-area-inset-bottom\)/);
  assert.match(bar, /isDark.value \? colors.dark : colors.light/);
  assert.doesNotMatch(read('src/custom-tab-bar/index.wxml'), /<view|<image/);
  for (const file of ['src/services/modal-presence.ts', 'src/services/theme.ts', 'src/components/AdaptiveModal.uvue', 'src/components/TimeEndPicker.uvue']) {
    assert.doesNotMatch(read(file), /getTabBar|setModalHandler|syncModalTabBar|tabBarInset/);
  }
});

test('底栏配置只来自 pages.json，开启微信 custom 保留系统路由', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-weixin-tab-bar.cjs', '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const pages = JSON.parse(read('src/pages.json').replace(/^\s*\/\/.*$/gm, ''));
  assert.deepEqual(tabs, pages.tabBar.list);
  assert.match(read('src/pages.json'), /\/\/ #ifdef MP-WEIXIN\s+"custom": true/);
});
