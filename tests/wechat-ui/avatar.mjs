// 仅测试：在源码副本中启用微信分支，模拟原生 chooseavatar 回调。
// 真实 HTTP 上传/保存请求由精确路径模拟；不能替代微信原生选择器真机验证。
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 20000 });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/avatar-validation/wechat-ui');
const project = path.join(output, 'project');
await mkdir(output, { recursive: true });
await rm(project, { recursive: true, force: true });
await mkdir(project);
await cp(path.join(root, 'src'), path.join(project, 'src'), { recursive: true,
  filter: file => !/project\.(private\.)?config\.json$/.test(file) });
for (const file of ['package.json', 'vite.config.js', 'index.html', 'tsconfig.json']) await cp(path.join(root, file), path.join(project, file));
for (const dir of ['node_modules', 'scripts']) await symlink(path.join(root, dir), path.join(project, dir));
const settings = path.join(project, 'src/pages/profile/settings.uvue');
await writeFile(settings, (await readFile(settings, 'utf8')).replaceAll('MP-WEIXIN', 'WEB'));
const origin = 'http://127.0.0.1:5192';
const server = spawn(process.execPath, [path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
  '-p', 'h5', '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser;
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
const id = '22222222222222222222222222222222';
try {
  let ready = false;
  for (let i = 0; i < 160; i++) {
    if (server.exitCode != null) throw Error(logs);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ channel: 'chrome' });
  const fixturePage = await browser.newPage();
  const png = Buffer.from(await fixturePage.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 72;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4e7ee3'; ctx.fillRect(0, 0, 72, 72);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(36, 25, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(36, 67, 25, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await fixturePage.close();
  for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
    const page = await context.newPage(), errors = [], uploads = [], writes = [];
    let failUpload = true, failSave = true, releaseUpload;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'avatar-fixture'));
    await page.route(origin + '/api/auth/secondary-lock/menus', route => route.fulfill({ json: { code: 0, data: [] } }));
    await page.route(origin + '/api/user/info', route => route.fulfill({ json: { code: 0, data: {
      id: '9223372036854775807', nickname: '模拟用户', introduction: '模拟签名', email: 'fixture@example.com', avatarFileId: null, avatarUrl: ''
    } } }));
    await page.route(origin + '/fixture-avatar.png', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.route(origin + '/api/file/upload', async route => {
      uploads.push(route.request());
      assert.equal(route.request().headers().authorization, 'Bearer avatar-fixture');
      assert.match(route.request().postDataBuffer().toString(), /name="bizType"\r\n\r\navatar/);
      if (failUpload) return route.fulfill({ json: { code: 1, message: '模拟头像上传失败' } });
      await new Promise(resolve => { releaseUpload = resolve; });
      return route.fulfill({ json: { code: 0, data: { id, fileUrl: '/fixture-avatar.png' } } });
    });
    await page.route(origin + '/api/users', route => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: failSave ? { code: 1, message: '模拟保存失败' } : { code: 0, data: null } });
    });
    await page.goto(origin + '/#/pages/profile/settings');
    const button = page.getByRole('button', { name: '从微信获取头像', exact: true });
    await expect(button).toBeVisible();
    await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('模拟用户');
    await page.locator('[aria-label="昵称"] input').fill('未保存的新昵称');
    const blob = await page.evaluate(base64 => {
      uni.navigateBack = () => { window.__avatarSaved = true; };
      return URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), x => x.charCodeAt(0))], { type: 'image/png' }));
    }, png.toString('base64'));
    await button.click();
    await button.evaluate(el => el.__vueParentComponent.emit('error', { detail: { errMsg: 'chooseAvatar:fail cancel' } }));
    await expect(page.getByRole('alert')).toHaveCount(0); assert.equal(uploads.length, 0);
    const select = async () => {
      await button.click();
      await button.evaluate((el, avatarUrl) => el.__vueParentComponent.emit('chooseavatar', { detail: { avatarUrl } }), blob);
    };
    await select();
    await expect(page.getByRole('alert')).toHaveText('模拟头像上传失败');
    await expect(page.locator('.avatar-fallback')).toBeVisible();
    await expect(page.locator('[aria-label="昵称"] input')).toHaveValue('未保存的新昵称');
    failUpload = false; await select();
    await expect.poll(() => uploads.length).toBe(2);
    await expect(button).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await button.evaluate((el, avatarUrl) => el.__vueParentComponent.emit('chooseavatar', { detail: { avatarUrl } }), blob);
    releaseUpload();
    await expect(page.locator('.settings-avatar img')).toHaveAttribute('src', '/fixture-avatar.png');
    assert.equal(uploads.length, 2); assert.equal(writes.length, 0);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('模拟保存失败');
    await expect(page.locator('.settings-avatar img')).toHaveAttribute('src', '/fixture-avatar.png');
    failSave = false;
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => window.__avatarSaved === true);
    await page.evaluate(() => uni.hideToast());
    await expect(page.locator('.uni-toast')).toBeHidden();
    await expect(page.locator('.settings-avatar img')).toHaveJSProperty('naturalWidth', 72);
    assert.deepEqual(writes.at(-1), { nickname: '未保存的新昵称', introduction: '模拟签名', avatarFileId: id });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await button.boundingBox(); assert.ok(bounds.height >= 44 && bounds.width >= 44);
    await page.screenshot({ path: path.join(output, `avatar-${width}-${colorScheme}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`微信头像取消、失败重试、防重复、上传保存及布局 ${width}px ${colorScheme}: passed`);
  }
} catch (error) {
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText());
  }
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await writeFile(path.join(output, 'server.log'), logs);
}
