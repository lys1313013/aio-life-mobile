// 仅测试：复制源码到忽略目录，在 H5 中编译小程序分支并模拟平台回调。
// 不向生产页面注入入口，不调用真实微信或业务服务器；不能替代微信真机验证。
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fixtures from '../e2e/fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Playwright 会清理 test-results；源码副本独立保存在 artifacts，避免并行验证互相删除。
const output = path.join(root, 'artifacts/wechat-ui');
const project = path.join(output, 'project');
await mkdir(output, { recursive: true });
await rm(project, { recursive: true, force: true });
await mkdir(project);
await cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true });
for (const file of ['package.json', 'vite.config.js', 'index.html']) await cp(path.join(root, file), path.join(project, file));
await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'));
await cp(path.join(root, 'scripts'), path.join(project, 'scripts'), { recursive: true });
for (const file of ['src/pages/login/index.uvue', 'src/pages/auth/web-login.uvue', 'src/services/wechat-auth.ts',
  'src/pages/profile/notifications.uvue', 'src/pages/profile/wechat-subscription.ts']) {
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
const button = (page, label) => page.locator('uni-button').filter({ has: page.getByText(label, { exact: true }) });
const fixtureLogin = { status: 'LOGGED_IN', id: '9223372036854775807', accessToken: 'wechat-fixture-token',
  hasPassword: false, accountUsername: 'u_fixture', newUser: true };
const authRoute = /\/api\/(?:auth\/(?:wechat\/mini\/(?:capabilities|login|register|phone-login|bind|password)|login|logout)|user\/info)(?:\?.*)?$/;
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
  if (process.env.AIO_WECHAT_UI_ONLY !== 'subscription') {
  for (const width of [390, 768, 1440]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const page = await context.newPage();
      const errors = [];
      const calls = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(authRoute, async route => {
        const request = route.request();
        const url = new URL(request.url()).pathname;
        calls.push({ url, body: request.postDataJSON(), authorization: request.headers().authorization });
        let data;
        if (url.endsWith('/capabilities')) data = { enabled: true, registrationEnabled: true };
        else if (url === '/api/auth/wechat/mini/login') data = pending;
        else if (url.endsWith('/register')) data = fixtureLogin;
        else if (url === '/api/auth/login') data = { accessToken: 'old-account-fixture-token' };
        else if (url.endsWith('/bind')) data = { ...fixtureLogin, hasPassword: true, newUser: false };
        else if (url === '/api/user/info') data = { id: fixtureLogin.id, nickname: '测试用户' };
        else if (url.endsWith('/logout')) data = null;
        else data = [];
        return route.fulfill({ json: { code: 0, data } });
      });
      await page.goto(origin + '/#/pages/login/index');
      await page.getByText('微信登录', { exact: true }).waitFor();
      await page.evaluate(() => { uni.login = options => options.success({ code: 'fixture-code' }); });
      await page.screenshot({ path: path.join(output, `wechat-${width}-${colorScheme}.png`), fullPage: true });
      await button(page, '微信登录').click();
      await button(page, '注册新账号').waitFor();
      assert.equal(await page.locator('[open-type="getPhoneNumber"]').count(), 0);
      assert.equal(await page.getByText('授权手机号并注册', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(output, `register-${width}-${colorScheme}.png`), fullPage: true });
      await button(page, '注册新账号').click();
      await page.getByText('设置登录密码', { exact: true }).first().waitFor();
      assert.equal(calls.filter(call => call.url.endsWith('/phone-login')).length, 0);
      assert.deepEqual(calls.find(call => call.url.endsWith('/register')).body, { loginTicket: pending.loginTicket });
      assert.equal(calls.filter(call => call.url.endsWith('/register')).length, 1);
      await page.screenshot({ path: path.join(output, `password-${width}-${colorScheme}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`微信登录/无手机号注册/首次设密布局 ${width}px ${colorScheme}: passed`);
    }
  }
  // 旧后端提供普通注册入口，新注册失败后重新获取票据。
  for (const direct of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let registrations = 0;
    let phoneCalls = 0;
    await page.route(authRoute, async route => {
      const url = new URL(route.request().url()).pathname;
      let data = pending;
      if (url.endsWith('/capabilities')) data = direct ? { enabled: true, registrationEnabled: true } : { enabled: true };
      if (url.endsWith('/register')) {
        registrations++;
        if (registrations === 1) return route.fulfill({ status: 400, json: { code: 100400, message: '登录票据已失效，请重新微信登录' } });
        data = fixtureLogin;
      }
      if (url.endsWith('/phone-login')) { phoneCalls++; throw new Error('不应请求手机号'); }
      return route.fulfill({ json: { code: 0, data } });
    });
    await page.goto(origin + '/#/pages/login/index');
    await page.getByText('微信登录', { exact: true }).waitFor();
    await page.evaluate(() => { uni.login = options => options.success({ code: 'fixture-code' }); });
    await button(page, '微信登录').click();
    await page.getByText('创建账号', { exact: true }).waitFor();
    if (direct) {
      await button(page, '注册新账号').click();
      await page.getByText('登录票据已失效，请重新微信登录', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => uni.getStorageSync('aio-life-mobile.access-token.v1') || ''), '');
      await button(page, '微信登录').click();
      await button(page, '注册新账号').click();
    } else {
      assert.equal(await page.getByText('注册新账号', { exact: true }).count(), 0);
      await button(page, '注册账号').waitFor();
      assert.equal(await page.locator('[open-type="getPhoneNumber"]').count(), 0);
    }
    if (direct) await page.getByText('设置登录密码', { exact: true }).first().waitFor();
    assert.equal(registrations, direct ? 2 : 0);
    assert.equal(phoneCalls, 0);
    await context.close();
  }
  console.log('旧后端注册入口兼容、新注册失败重新获取票据恢复: passed');
  // 能力接口临时失败时仍可重试，避免只有微信身份的用户停留在密码表单。
  const retryPage = await browser.newPage();
  let capabilityCalls = 0;
  await retryPage.route(authRoute, async route => {
    if (++capabilityCalls === 1) return route.abort();
    return route.fulfill({ json: { code: 0, data: { enabled: true } } });
  });
  await retryPage.goto(origin + '/#/pages/login/index');
  await button(retryPage, '重试微信登录').click();
  await retryPage.getByText('微信登录', { exact: true }).waitFor();
  assert.equal(capabilityCalls, 2);
  await retryPage.close();
  console.log('微信能力加载失败保留密码入口并可重试: passed');
  // 单独验证原账号绑定流程及临时会话清理。
  const page = await browser.newPage();
  const calls = [];
  await page.route(authRoute, async route => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    calls.push({ url, body: request.postDataJSON(), token: request.headers().authorization });
    let data = [];
    if (url.endsWith('/capabilities')) data = { enabled: true, registrationEnabled: true };
    if (url.endsWith('/mini/login')) data = pending;
    if (url === '/api/auth/login') data = { accessToken: 'old-account-fixture-token' };
    if (url.endsWith('/bind')) data = { ...fixtureLogin, hasPassword: true, newUser: false };
    if (url === '/api/user/info') data = { id: fixtureLogin.id, nickname: '原账号测试用户' };
    await route.fulfill({ json: { code: 0, data } });
  });
  await page.goto(origin + '/#/pages/login/index');
  await page.getByText('微信登录', { exact: true }).waitFor();
  await page.evaluate(() => {
    uni.login = options => options.success({ code: 'fixture-code' });
    uni.reLaunch = ({ url }) => { window.__wechatDestination = url; };
  });
  await button(page, '微信登录').click();
  await button(page, '已有账号，登录并绑定').click();
  await page.locator('[aria-label="账号"] input').fill('fixture-old-user');
  await page.locator('[aria-label="密码"] input').fill('fixture-old-password');
  await button(page, '登录并绑定微信').click();
  await page.waitForFunction(() => uni.getStorageSync('aio-life-mobile.access-token.v1') === 'wechat-fixture-token'
    && window.__wechatDestination === '/pages/home/index');
  await page.screenshot({ path: path.join(output, 'binding-result.png'), fullPage: true });
  assert.equal(await page.evaluate(() => uni.getStorageSync('aio-life-mobile.access-token.v1')), 'wechat-fixture-token');
  assert.equal(calls.find(call => call.url.endsWith('/bind')).token, 'Bearer old-account-fixture-token');
  assert.equal(calls.find(call => call.url.endsWith('/logout')).token, 'Bearer old-account-fixture-token');
  assert.equal(calls.filter(call => call.url.endsWith('/phone-login')).length, 0);
  console.log('原账号绑定保留用户入口、无重复手机号授权、清理临时会话: passed');
  // 扫码确认：新用户注册后返回确认页，只有明确点击才发确认请求。
  const scene = 'a'.repeat(32);
  for (const width of [390, 768, 1440]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const scanPage = await context.newPage();
      // 注册完成会预取其他页面配置；全部隔离，不能让模拟 Token 请求真实后端。
      await context.route(origin + '/api/**', route => route.fulfill({ json: { code: 0, data: [] } }));
      const scanCalls = [];
      await scanPage.route(/\/api\/(?:auth\/(?:wechat\/(?:web\/(?:scan|confirm|cancel)|mini\/(?:capabilities|login|register))|secondary-lock\/menus)|user\/info|menu\/all)(?:\?.*)?$/, async route => {
        const url = new URL(route.request().url()).pathname;
        const body = route.request().postDataJSON();
        scanCalls.push({ url, body });
        let data = [];
        if (url.endsWith('/capabilities')) data = { enabled: true, registrationEnabled: true };
        if (url.endsWith('/mini/login')) data = pending;
        if (url.endsWith('/mini/register')) data = fixtureLogin;
        if (url.endsWith('/web/scan')) data = { status: 'SCANNED' };
        if (url.endsWith('/web/confirm')) data = { status: 'CONFIRMED' };
        if (url.endsWith('/web/cancel')) data = { status: 'CANCELLED' };
        if (url.endsWith('/user/info')) data = { id: fixtureLogin.id, nickname: '扫码测试用户' };
        return route.fulfill({ json: { code: 0, data } });
      });
      await scanPage.goto(origin + '/#/pages/auth/web-login?scene=' + scene);
      await button(scanPage, '微信登录').waitFor();
      await scanPage.evaluate(() => { uni.login = options => options.success({ code: 'fixture-fresh-code' }); });
      await button(scanPage, '微信登录').click();
      await button(scanPage, '注册新账号').click();
      await button(scanPage, '暂不设置').click();
      await scanPage.getByText('扫码测试用户', { exact: true }).waitFor();
      assert.equal(scanCalls.filter(call => call.url.endsWith('/web/confirm')).length, 0);
      await scanPage.screenshot({ path: path.join(output, `web-confirm-${width}-${colorScheme}.png`), fullPage: true });
      const confirm = width !== 768;
      await button(scanPage, confirm ? '确认登录' : '取消').click();
      await scanPage.getByText(confirm ? '已确认登录' : '已取消登录', { exact: true }).waitFor();
      const mutation = scanCalls.find(call => call.url.endsWith(confirm ? '/web/confirm' : '/web/cancel'));
      assert.deepEqual(mutation.body, confirm ? { scene, loginCode: 'fixture-fresh-code' } : { scene });
      await context.close();
    }
  }
  console.log('新用户扫码→注册→返回确认页→确认/取消，三种尺寸和深浅主题: passed');
  }
  // 订阅通知仅在测试副本编译小程序分支，原生回调和业务 API 全部使用模拟数据。
  for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
    const notice = await context.newPage();
    const writes = [];
    let enabled = true, bound = true, failTest = false, delay = false, reads = 0;
    let current = [{ bizType: 'LEETCODE_REMINDER', description: '力扣未打卡提醒', visible: true,
      channels: [{ channel: 'EMAIL', enabled: true }, { channel: 'WECHAT_MINI', enabled: false }] }];
    const errors = [];
    notice.on('pageerror', error => errors.push(error.message));
    await notice.route(origin + '/api/**', async route => {
      const url = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let data = fixtures.dashboardFixture(url) ?? [];
      if (url === '/api/auth/login') data = { accessToken: 'fixture-notice-token' };
      if (url.endsWith('/capabilities')) data = { enabled: false };
      if (url.endsWith('/user/info')) data = { id: '9223372036854775807', nickname: '通知测试用户' };
      if (url.endsWith('/channels/feishu')) data = { configured: false, enabled: false };
      if (url.endsWith('/channels/wechat-mini')) data = { enabled, bound, bizType: 'LEETCODE_REMINDER', templateId: 'fixture-template' };
      if (url.endsWith('/notification/preferences')) {
        if (method === 'GET') reads++;
        if (method === 'PUT') {
          const body = route.request().postDataJSON();
          writes.push({ url, body });
          assert.deepEqual(body, { items: [{ bizType: 'LEETCODE_REMINDER', channel: 'WECHAT_MINI', enabled: true }] });
          current[0].channels[1].enabled = true;
        }
        data = current;
      }
      if (url.endsWith('/channels/wechat-mini/test')) {
        writes.push({ url });
        if (failTest) return route.fulfill({ json: { code: 1, message: '没有可用的订阅机会，请先在小程序点击订阅一次' } });
        data = null;
      }
      if (delay && url.includes('/notification/')) await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ json: { code: 0, data } });
    });
    await notice.goto(origin + '/#/pages/login/index');
    await notice.getByRole('button', { name: '登录', exact: true }).waitFor().catch(async error => {
      await notice.screenshot({ path: path.join(output, 'subscription-startup-error.png') });
      throw new Error(error.message + '\n' + errors.join('\n') + '\n' + await notice.locator('body').innerText());
    });
    await notice.locator('[aria-label="账号"] input').fill('fixture');
    await notice.locator('[aria-label="密码"] input').fill('fixture-password');
    await notice.getByRole('button', { name: '登录', exact: true }).click();
    await notice.waitForFunction(() => uni.getStorageSync('aio-life-mobile.access-token.v1') === 'fixture-notice-token');
    await notice.evaluate(() => {
      uni.reLaunch({ url: '/pages/profile/notifications' });
      window.__subscriptionMode = 'reject';
      window.__subscriptionCalls = 0;
      uni.requestSubscribeMessage = options => {
        window.__subscriptionCalls++;
        if (window.__subscriptionMode === 'wait') window.__pendingSubscription = options;
        else options.success({ [options.tmplIds[0]]: window.__subscriptionMode });
      };
    });
    const subscribe = notice.getByRole('button', { name: '订阅一次', exact: true });
    await subscribe.waitFor();
    await subscribe.click();
    await notice.getByText('未获得订阅授权，可再次尝试', { exact: true }).waitFor();
    assert.equal(writes.length, 0);
    await notice.evaluate(() => { window.__subscriptionMode = 'wait'; });
    await subscribe.click();
    assert.equal(await subscribe.isDisabled(), true);
    await notice.evaluate(() => {
      document.querySelector('[aria-label="订阅一次"]').click();
      const options = window.__pendingSubscription;
      options.success({ [options.tmplIds[0]]: 'accept' });
    });
    await notice.getByText('已订阅一次', { exact: true }).waitFor();
    assert.equal(await notice.evaluate(() => window.__subscriptionCalls), 2);
    assert.equal(writes.length, 1);
    await notice.getByRole('button', { name: '发送测试', exact: true }).click();
    await notice.getByText('发送测试将消耗一次订阅机会，确认发送？', { exact: true }).waitFor();
    assert.equal(writes.length, 1);
    await notice.getByRole('button', { name: '确认', exact: true }).click();
    await notice.getByText('测试已发送', { exact: true }).waitFor();
    assert.equal(writes.length, 2);
    failTest = true;
    await notice.getByRole('button', { name: '发送测试', exact: true }).click();
    await notice.getByRole('button', { name: '确认', exact: true }).click();
    await notice.getByText('没有可用的订阅机会，请先在小程序点击订阅一次', { exact: true }).waitFor();
    await notice.getByRole('button', { name: '取消', exact: true }).click();
    await notice.getByText('测试已发送', { exact: true }).waitFor({ state: 'hidden' });
    await notice.locator('.notification-panel').last().waitFor({ state: 'visible' });
    await notice.screenshot({ path: path.join(output, `subscription-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
    const before = await notice.locator('.notification-panel').last().boundingBox();
    delay = true;
    const previousReads = reads;
    await notice.locator('.mobile-page-scroll').evaluate(element => {
      let component = element.__vueParentComponent;
      while (component && component.type.__name !== 'MobilePage') component = component.parent;
      if (!component) throw new Error('Missing MobilePage');
      component.emit('refresh');
    });
    await notice.waitForFunction(() => document.querySelector('[aria-label="正在更新消息通知"]'));
    const after = await notice.locator('.notification-panel').last().boundingBox();
    assert.ok(Math.abs(before.y - after.y) < 2);
    assert.ok(reads > previousReads);
    assert.equal(await notice.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    bound = false;
    await notice.reload();
    await notice.getByText('请先通过微信登录绑定当前账号', { exact: true }).waitFor();
    assert.equal(await subscribe.count(), 0);
    enabled = false;
    await notice.reload();
    await notice.getByText('暂未开通订阅消息', { exact: true }).waitFor();
    assert.equal(await subscribe.count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`订阅授权/拒绝/去重/测试确认/无额度/未绑定/未开通 ${width}px ${colorScheme}: passed`);
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await writeFile(path.join(output, 'server.log'), logs);
}
