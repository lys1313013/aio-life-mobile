import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('../src/pages/profile/wechat-subscription.ts', import.meta.url), 'utf8');
const create = (native, wechat = true) => {
  const code = source
    .replace(wechat ? /\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g : /\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g, '')
    .replace('export ', '');
  return new Function('uni', code + '\nreturn subscribeWechatOnce;')(native);
};

test('点击调用链内同步调起订阅且只请求当前模板', async () => {
  let called = false;
  const subscribe = create({ requestSubscribeMessage(options) {
    called = true;
    assert.deepEqual(options.tmplIds, ['fixture-template']);
    options.success({ 'fixture-template': 'accept' });
  } });
  const result = subscribe('fixture-template');
  assert.equal(called, true);
  assert.equal(await result, true);
});

test('接口success但用户拒绝、模板被禁或其他模板accept均不能当作同意', async () => {
  for (const result of [{ 'fixture-template': 'reject' }, { 'fixture-template': 'ban' }, { other: 'accept' }]) {
    const subscribe = create({ requestSubscribeMessage(options) { options.success(result); } });
    await assert.rejects(subscribe('fixture-template'), /未获得|暂不可用/);
  }
});

test('原生接口失败可重试且不显示上游错误原文', async () => {
  const subscribe = create({ requestSubscribeMessage(options) { options.fail({ errMsg: 'private-native-detail' }); } });
  await assert.rejects(subscribe('fixture-template'), /订阅未完成/);
});

test('H5与App不调用小程序授权接口', async () => {
  const subscribe = create({}, false);
  await assert.rejects(subscribe('fixture-template'), /微信小程序内/);
});
