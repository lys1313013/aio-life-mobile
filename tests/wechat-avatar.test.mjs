import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';
import { ref, computed, watch, reactive, effectScope } from 'vue';

// 执行真实页面及上传接口，只模拟平台 I/O 和页面生命周期。
const pageSource = (await readFile(new URL('../src/pages/profile/settings.uvue', import.meta.url), 'utf8'))
  .split('<script setup lang="ts">')[1].split('</script>')[0]
  .replace(/^import .*$/gm, '');
const apiSource = (await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')).split('export function uploadAvatar')[1];
const contract = await readFile(new URL('../src/services/contract.ts', import.meta.url), 'utf8');
const { readResponse } = await import(`data:text/javascript;base64,${Buffer.from(contract).toString('base64')}`);
const compile = source => transformSync(source, { loader: 'ts' }).code;
const createUpload = new Function('uni', 'session', 'clearSession', 'readResponse', 'baseURL', compile('function uploadAvatar' + apiSource) + '\nreturn uploadAvatar;');
const createPage = new Function('ref', 'computed', 'watch', 'onShow', 'onHide', 'onUnload', 'fetchUser', 'request', 'uploadAvatar', 'restoreSession', 'session', 'uni', compile(pageSource) + '\nreturn { form, ready, uploading, saving, errorText, chooseAvatar, beginWechatAvatarSelection, chooseWechatAvatar, wechatAvatarError, save };');
const oldId = '11111111111111111111111111111111', newId = '22222222222222222222222222222222';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const scope = effectScope(); t.after(() => scope.stop());
  const hooks = {}, uploads = [], writes = [], navigations = [], choices = [];
  const control = { saveError: false };
  const session = reactive({ token: 'fixture-a', user: null });
  const profile = { nickname: '模拟用户', introduction: '模拟签名', avatarFileId: oldId, avatarUrl: '/old.png' };
  const uni = {
    uploadFile: options => uploads.push(options), chooseImage: options => choices.push(options),
    reLaunch: options => navigations.push(options.url), navigateBack: () => navigations.push('back'), showToast() {},
  };
  const upload = createUpload(uni, session, () => { session.token = ''; }, readResponse, 'https://fixture.invalid/api');
  const page = scope.run(() => createPage(ref, computed, watch,
    fn => { hooks.show = fn; }, fn => { hooks.hide = fn; }, fn => { hooks.unload = fn; },
    async () => { session.user = { ...profile }; return { ...profile }; },
    async (path, method, body) => { writes.push({ path, method, body }); if (control.saveError) throw Error('模拟保存失败'); Object.assign(profile, body); },
    upload, () => {}, session, uni));
  hooks.show(); await tick(); assert.equal(page.ready.value, true);
  const select = (url = 'wxfile://tmp/avatar.png') => { page.beginWechatAvatarSelection(); return page.chooseWechatAvatar({ detail: { avatarUrl: url } }); };
  const succeed = (index = uploads.length - 1, data = { id: newId, fileUrl: '/new.png' }) => uploads[index].success({ statusCode: 200, data: JSON.stringify({ rscode: '0', data }) });
  return { page, session, profile, hooks, uploads, writes, navigations, choices, control, select, succeed };
}

test('微信头像上传使用临时文件、鉴权和 avatar 类型；仅保存文件 ID，保留未保存文案', async t => {
  const f = await fixture(t), p = f.page;
  p.form.value.nickname = '新昵称'; p.form.value.introduction = '新签名';
  const pending = f.select();
  assert.equal(p.uploading.value, true);
  assert.equal(f.uploads[0].filePath, 'wxfile://tmp/avatar.png');
  assert.equal(f.uploads[0].url, 'https://fixture.invalid/api/file/upload');
  assert.deepEqual(f.uploads[0].header, { Authorization: 'Bearer fixture-a' });
  assert.deepEqual(f.uploads[0].formData, { bizType: 'avatar' });
  assert.equal(f.writes.length, 0);
  await p.save(); assert.equal(f.writes.length, 0);
  f.succeed(); await pending;
  assert.equal(p.uploading.value, false); assert.equal(p.form.value.avatarUrl, '/new.png');
  await p.save();
  assert.deepEqual(f.writes, [{ path: '/users', method: 'PUT', body: { nickname: '新昵称', introduction: '新签名', avatarFileId: newId } }]);
  assert.deepEqual(f.navigations, ['back']);
});

test('取消、空头像和重复回调不上传；上传中不能重复选择或保存', async t => {
  const f = await fixture(t), p = f.page;
  p.beginWechatAvatarSelection(); p.wechatAvatarError({ detail: { errMsg: 'chooseAvatar:fail cancel' } });
  assert.equal(p.errorText.value, '');
  await f.select(''); assert.equal(f.uploads.length, 0);
  const pending = f.select();
  await p.chooseWechatAvatar({ detail: { avatarUrl: 'wxfile://duplicate' } });
  await f.select(); p.chooseAvatar(); await p.save();
  assert.equal(f.uploads.length, 1); assert.equal(f.choices.length, 0); assert.equal(f.writes.length, 0);
  f.succeed(); await pending;
});

test('微信能力失败提示可重试；上传失败保留原头像和文案', async t => {
  const f = await fixture(t), p = f.page;
  p.form.value.nickname = '未保存昵称';
  p.beginWechatAvatarSelection(); p.wechatAvatarError({ detail: { errMsg: 'chooseAvatar:fail' } });
  assert.match(p.errorText.value, /无法获取微信头像/);
  const pending = f.select(); f.uploads[0].fail(); await pending;
  assert.equal(p.form.value.avatarFileId, oldId); assert.equal(p.form.value.avatarUrl, '/old.png');
  assert.equal(p.form.value.nickname, '未保存昵称'); assert.equal(p.uploading.value, false);
  assert.match(p.errorText.value, /头像上传失败/);
  const retry = f.select(); f.succeed(); await retry;
  assert.equal(p.errorText.value, ''); assert.equal(p.form.value.avatarFileId, newId);
});

test('上传返回错误文件 ID 不覆盖旧头像，保存失败可直接重试', async t => {
  const f = await fixture(t), p = f.page;
  const invalid = f.select(); f.succeed(0, { id: 123, fileUrl: '/bad.png' }); await invalid;
  assert.equal(p.form.value.avatarFileId, oldId); assert.match(p.errorText.value, /上传结果异常/);
  const retry = f.select(); f.succeed(); await retry;
  f.control.saveError = true; await p.save();
  assert.equal(p.form.value.avatarFileId, newId); assert.equal(p.saving.value, false); assert.equal(f.navigations.length, 0);
  f.control.saveError = false; await p.save(); assert.deepEqual(f.navigations, ['back']);
});

for (const stage of ['选择中', '上传中']) test(`${stage}离页及返回后不接收旧头像`, async t => {
  const f = await fixture(t), p = f.page;
  p.beginWechatAvatarSelection();
  const pending = stage === '上传中' ? p.chooseWechatAvatar({ detail: { avatarUrl: 'wxfile://old' } }) : null;
  f.hooks.hide(); f.hooks.show(); await tick();
  if (pending) { f.succeed(); await pending; }
  else await p.chooseWechatAvatar({ detail: { avatarUrl: 'wxfile://old' } });
  assert.equal(p.form.value.avatarFileId, oldId); assert.equal(p.uploading.value, false);
  assert.equal(f.uploads.length, pending ? 1 : 0);
});

test('切账号后旧上传成功或旧 401 不修改新账号', async t => {
  for (const statusCode of [200, 401]) {
    const f = await fixture(t), p = f.page;
    const pending = f.select(); f.session.token = 'fixture-b'; await tick();
    f.uploads[0].success({ statusCode, data: JSON.stringify({ rscode: '0', data: { id: newId, fileUrl: '/new.png' } }) });
    await pending;
    assert.equal(f.session.token, 'fixture-b'); assert.equal(p.form.value.avatarFileId, oldId); assert.deepEqual(f.navigations, []);
  }
});

test('当前账号上传 401 清理会话并跳转登录', async t => {
  const f = await fixture(t), pending = f.select();
  f.uploads[0].success({ statusCode: 401, data: '{}' }); await pending;
  assert.equal(f.session.token, ''); assert.equal(f.page.ready.value, false);
  assert.deepEqual(f.navigations, ['/pages/login/index']);
});

test('原有相册入口仍通过相同上传流程更新头像', async t => {
  const f = await fixture(t); f.page.chooseAvatar();
  const pending = f.choices[0].success({ tempFilePaths: ['fixture-album.png'] });
  assert.equal(f.uploads[0].filePath, 'fixture-album.png'); f.succeed(); await pending;
  assert.equal(f.page.form.value.avatarFileId, newId);
});
