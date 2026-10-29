import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import { parse } from '@vue/compiler-sfc';
const require = createRequire(import.meta.url);
const { preprocess } = require('@dcloudio/uni-cli-shared/lib/preprocess');
const { initScopedPreContext } = require('@dcloudio/uni-cli-shared/dist/preprocess/context.js');
function context(platform) {
  return initScopedPreContext(platform === 'android' ? 'app' : platform, {}, platform === 'android' ? 'app-android' : undefined, true).preUVueContext;
}
function evaluate(source, dependencies) {
  const code = transformSync(source.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('exports', 'module', ...Object.keys(dependencies), code)(module.exports, module, ...Object.values(dependencies));
  return module.exports;
}

for (const platform of ['android', 'mp-weixin', 'h5']) test(`${platform} 画布逻辑尺寸统一，原生 backing store 不被覆盖`, () => {
  const source = preprocess(fs.readFileSync('src/services/canvas-surface.ts', 'utf8'), context(platform), { type: 'js' });
  const surface = evaluate(source, { uni: { getWindowInfo: () => ({ pixelRatio: 3 }) }, window: { matchMedia: () => ({ matches: false }) } });
  const transforms = [], canvas = { width: 112, height: 112 };
  surface.configureCanvasSurface({ canvas, setTransform: (...args) => transforms.push(args) }, 56, 56);
  assert.equal(canvas.width, platform === 'android' ? 112 : 168);
  assert.deepEqual(transforms, [[platform === 'android' ? 2 : 3, 0, 0, platform === 'android' ? 2 : 3, 0, 0]]);
  assert.equal(surface.reduceCanvasMotion(), platform !== 'h5');
});

test('Android 外链只启动 HTTPS 系统入口，启动失败可反馈且不依赖 plus', () => {
  const calls = [], state = { fail: false };
  class Intent { static ACTION_VIEW = 'view'; constructor(action, uri) { this.action = action; this.uri = uri; } }
  const Uri = { parse(value) { const url = new URL(value); return { getScheme: () => url.protocol.slice(0, -1), getHost: () => url.hostname || null, getUserInfo: () => url.username || url.password || null }; } };
  const source = fs.readFileSync('src/uni_modules/aio-external-link/utssdk/app-android/index.uts', 'utf8');
  const native = evaluate(source, { Intent, Uri, UTSAndroid: { getUniActivity: () => ({ startActivity(intent) { if (state.fail) throw Error('模拟系统拒绝'); calls.push(intent); } }) } });
  assert.equal(native.openExternalWeb('https://example.test/video'), true);
  for (const url of ['http://example.test/', 'file:///tmp/demo', 'javascript:alert(1)', 'https://user@example.test/']) assert.equal(native.openExternalWeb(url), false);
  state.fail = true;
  assert.equal(native.openExternalWeb('https://example.test/'), false);
  assert.equal(calls.length, 1);
  const service = preprocess(fs.readFileSync('src/services/external-link.ts', 'utf8'), context('android'), { type: 'js' });
  const messages = [];
  const links = evaluate(service, { openExternalWeb: native.openExternalWeb, uni: { showToast: value => messages.push(value) } });
  links.openExternalLink('https://example.test/');
  assert.equal(messages[0].title, '无法打开链接，请重试');
});

for (const platform of ['android', 'mp-weixin']) test(`${platform} 公共头像按钮在选择前通知页面，忙碌时不再选择`, () => {
  const { descriptor } = parse(fs.readFileSync('src/components/AvatarPickerButton.uvue', 'utf8'));
  const source = preprocess(descriptor.scriptSetup.content, context(platform), { type: 'js' });
  const events = [], choices = [], props = { disabled: false, loading: false };
  const adapter = evaluate(source + '\nexport {begin}', { defineProps: () => props, defineEmits: () => (...args) => events.push(args), uni: { chooseImage: value => choices.push(value) } });
  adapter.begin();
  assert.deepEqual(events, [['start']]);
  assert.equal(choices.length, platform === 'android' ? 1 : 0);
  if (platform === 'android') {
    choices[0].success({ tempFilePaths: ['mock-image.png'] });
    assert.deepEqual(events[1], ['selected', { detail: { avatarUrl: 'mock-image.png' } }]);
  }
  const count = events.length;
  props.loading = true; adapter.begin();
  props.loading = false; props.disabled = true; adapter.begin();
  assert.equal(events.length, count);
});
