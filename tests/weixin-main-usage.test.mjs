import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unusedMainScripts } from '../scripts/weixin-main-usage.mjs';
import { weixinSharedServices } from '../scripts/weixin-shared-services.mjs';

const chunk = (fileName, code = '') => ({ fileName, code, type: 'chunk' });
const json = (fileName, data) => ({ fileName, source: JSON.stringify(data), type: 'asset' });
const config = { pages: ['pages/home/index'], subPackages: [{ root: 'pages/feature', pages: ['index'] }] };
const bundle = files => Object.fromEntries(files.map(file => [file.fileName, file]));

test('识别仅被分包使用的主包 JS，包括间接依赖和完全无引用文件', () => {
  const output = bundle([
    chunk('app.js'), chunk('pages/home/index.js'),
    chunk('pages/feature/index.js', 'require("../../services/feature.js")'),
    chunk('services/feature.js', 'require("./helper.js")'),
    chunk('services/helper.js'), chunk('services/unused.js'),
  ]);
  assert.deepEqual(unusedMainScripts(output, config), ['services/feature.js', 'services/helper.js', 'services/unused.js']);
});

test('主包页面与组件的间接公共依赖保留，循环依赖不会卡死', () => {
  const output = bundle([
    chunk('app.js'), chunk('pages/home/index.js', 'require("../../services/session.js")'),
    json('pages/home/index.json', { usingComponents: { card: '../../components/Card' } }),
    chunk('components/Card.js', 'require("../services/icons.js")'),
    json('components/Card.json', { component: true }),
    chunk('services/icons.js', 'require("./session.js")'),
    chunk('services/session.js', 'require("./icons.js")'),
  ]);
  assert.deepEqual(unusedMainScripts(output, config), []);
});

test('分包组件不能让仅分包使用的工具误判为主包已使用', () => {
  const output = bundle([
    chunk('app.js'), chunk('pages/home/index.js'),
    chunk('pages/feature/Poster.js', 'require("../../services/poster.js")'),
    json('pages/feature/Poster.json', { component: true }),
    chunk('services/poster.js'),
  ]);
  assert.deepEqual(unusedMainScripts(output, config), ['services/poster.js']);
});

test('全局组件、原生注册组件和自定义 tabBar 都是有效入口', () => {
  const output = bundle([
    chunk('app.js'), chunk('pages/home/index.js'),
    json('app.json', { usingComponents: { global: '/components/Global', plugin: 'plugin://test/component' } }),
    chunk('components/Global.js'),
    chunk('components/Native.js', 'require("../services/native.js")'),
    json('components/Native.json', { component: true }),
    chunk('services/native.js'), chunk('custom-tab-bar/index.js'),
  ]);
  assert.deepEqual(unusedMainScripts(output, { ...config, tabBar: { custom: true } }), []);
});

test('分包副本隔离、嵌套工具跟随归属，但登录状态单例仍引用主包', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const input = path.resolve(root, 'src');
  const plugin = weixinSharedServices();
  plugin.configResolved({ root });
  plugin.buildStart();
  const context = {
    error: message => { throw Error(message); },
    resolve: async id => ({ id }),
    addWatchFile() {},
  };
  const resolve = (source, importer) => plugin.resolveId.call(context, source, importer);
  const finance = await resolve('../../services/use-card-order.ts', `${input}/pages/finance/cards.uvue`);
  const admin = await resolve('../../services/use-card-order.ts', `${input}/pages/admin/bank-card-covers.uvue`);
  assert.notEqual(finance, admin);
  assert.equal(await resolve('./card-order.ts', finance), `${input}/pages/finance/shared/services/card-order.ts`);
  assert.match(plugin.load.call(context, finance).code, /function useCardOrder/);
  const guard = await resolve('../../../services/domains/session-guard.ts', `${input}/pages/coding/services/coding.ts`);
  assert.equal((await resolve('../session.ts', guard)).id, `${input}/services/session.ts`);
  await assert.rejects(resolve('../../services/use-card-order.ts', `${input}/pages/home/index.uvue`), /主包引用/);
});
