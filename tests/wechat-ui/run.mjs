// 仅测试：复制源码到忽略目录，在 H5 中编译小程序分支并模拟平台回调。
// 不向生产页面注入入口，不调用真实微信或业务服务器；不能替代微信真机验证。
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'test-results/wechat-ui');
const project = path.join(output, 'project');
await mkdir(output, { recursive: true });
await rm(project, { recursive: true, force: true });
await mkdir(project);
await cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true });
for (const file of ['package.json', 'vite.config.js', 'index.html']) await cp(path.join(root, file), path.join(project, file));
await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'));
for (const file of ['src/pages/login/index.uvue', 'src/services/wechat-auth.ts']) {
  const target = path.join(project, file);
  await writeFile(target, (await readFile(target, 'utf8')).replaceAll('MP-WEIXIN', 'WEB'));
}
const port = 5187;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
  '-p', 'h5', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
let browser;
const fixtureLogin = { status: 'LOGGED_IN', id: '9223372036854775807', accessToken: 'wechat-fixture-token',
  hasPassword: false, accountUsername: 'u_fixture', newUser: true };
const pending = { status: 'PHONE_REQUIRED', loginTicket: 'fixture-ticket', expiresIn: 300 };
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode != null) throw new Error(logs);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  for (const width of [390, 768, 1440]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const page = await context.newPage();
      const errors = [];
      const calls = [];
      page.on('pageerror', error => errors.push(error.message));
      let phoneResult = pending;
      await page.route(`${origin}/api/**`, async route => {
        const request = route.request();
        const url = new URL(request.url()).pathname;
        calls.push({ url, body: request.postDataJSON(), authorization: request.headers().authorization });
        let data;
        if (url.endsWith('/capabilities')) data = { enabled: true };
        else if (url === '/api/auth/wechat/mini/login') data = pending;
        else if (url.endsWith('/phone-login')) data = phoneResult;
        else if (url === '/api/auth/login') data = { accessToken: 'old-account-fixture-token' };
        else if (url.endsWith('/bind')) data = { ...fixtureLogin, hasPassword: true, newUser: false };
        else if (url === '/api/user/info') data = { id: fixtureLogin.id, nickname: '测试用户' };
        else if (url.endsWith('/logout')) data = null;
        else data = [];
        return route.fulfill({ json: { rscode: '0', data } });
      });
      await page.goto(origin + '/#/pages/login/index');
      await page.getByText('微信登录', { exact: true }).waitFor();
      await page.evaluate(() => { uni.login = options => options.success({ code: 'fixture-code' }); });
      await page.screenshot({ path: path.join(output, `wechat-${width}-${colorScheme}.png`), fullPage: true });
      await page.getByText('微信登录', { exact: true }).click();
      const phoneButton = page.locator('uni-button').filter({ hasText: '授权手机号并注册' });
      await phoneButton.waitFor();
      await page.screenshot({ path: path.join(output, `phone-${width}-${colorScheme}.png`), fullPage: true });
      // 模拟用户拒绝原生授权，不应发出手机号请求。
      await phoneButton.evaluate(el => el.__vueParentComponent.emit('getphonenumber', { detail: { errMsg: 'getPhoneNumber:fail user deny' } }));
      await page.getByText('未完成手机号授权，可重试或使用已有账号登录').waitFor();
      assert.equal(calls.filter(call => call.url.endsWith('/phone-login')).length, 0);
      // 模拟成功授权，新用户进入可跳过的首次设密页面。
      phoneResult = fixtureLogin;
      await phoneButton.evaluate(el => el.__vueParentComponent.emit('getphonenumber', { detail: { code: 'fixture-phone-code' } }));
      await page.getByText('设置登录密码', { exact: true }).waitFor();
      assert.equal(calls.find(call => call.url.endsWith('/phone-login')).body.phoneCode, 'fixture-phone-code');
      await page.screenshot({ path: path.join(output, `password-${width}-${colorScheme}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`微信登录/取消授权/手机号注册/首次设密布局 ${width}px ${colorScheme}: passed`);
    }
  }
  // 能力接口临时失败时仍可重试，避免只有微信身份的用户停留在密码表单。
  const retryPage = await browser.newPage();
  let capabilityCalls = 0;
  await retryPage.route(`${origin}/api/**`, async route => {
    if (++capabilityCalls === 1) return route.abort();
    return route.fulfill({ json: { rscode: '0', data: { enabled: true } } });
  });
  await retryPage.goto(origin + '/#/pages/login/index');
  await retryPage.getByText('重试微信登录', { exact: true }).click();
  await retryPage.getByText('微信登录', { exact: true }).waitFor();
  assert.equal(capabilityCalls, 2);
  await retryPage.close();
  console.log('微信能力加载失败保留密码入口并可重试: passed');
  // 单独验证原账号绑定流程及临时会话清理。
  const page = await browser.newPage();
  const calls = [];
  await page.route(`${origin}/api/**`, async route => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    calls.push({ url, body: request.postDataJSON(), token: request.headers().authorization });
    let data = [];
    if (url.endsWith('/capabilities')) data = { enabled: true };
    if (url.endsWith('/mini/login')) data = pending;
    if (url === '/api/auth/login') data = { accessToken: 'old-account-fixture-token' };
    if (url.endsWith('/bind')) data = { ...fixtureLogin, hasPassword: true, newUser: false };
    if (url === '/api/user/info') data = { id: fixtureLogin.id, nickname: '原账号测试用户' };
    await route.fulfill({ json: { rscode: '0', data } });
  });
  await page.goto(origin + '/#/pages/login/index');
  await page.getByText('微信登录', { exact: true }).waitFor();
  await page.evaluate(() => { uni.login = options => options.success({ code: 'fixture-code' }); });
  await page.getByText('微信登录', { exact: true }).click();
  await page.getByText('已有账号，登录并绑定', { exact: true }).click();
  await page.locator('[aria-label="账号"] input').fill('fixture-old-user');
  await page.locator('[aria-label="密码"] input').fill('fixture-old-password');
  await page.getByText('登录并绑定微信', { exact: true }).click();
  await page.waitForFunction(() => uni.getStorageSync('aio-life-mobile.access-token.v1') === 'wechat-fixture-token'
    && !location.hash.includes('/pages/login/index'));
  await page.screenshot({ path: path.join(output, 'binding-result.png'), fullPage: true });
  assert.equal(await page.evaluate(() => uni.getStorageSync('aio-life-mobile.access-token.v1')), 'wechat-fixture-token');
  assert.equal(calls.find(call => call.url.endsWith('/bind')).token, 'Bearer old-account-fixture-token');
  assert.equal(calls.find(call => call.url.endsWith('/logout')).token, 'Bearer old-account-fixture-token');
  assert.equal(calls.filter(call => call.url.endsWith('/phone-login')).length, 0);
  console.log('原账号绑定保留用户入口、无重复手机号授权、清理临时会话: passed');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await writeFile(path.join(output, 'server.log'), logs);
}
