import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';
import { parse } from '@vue/compiler-sfc';

async function load(source) {
  const code = transformSync(source, { loader: 'ts', format: 'esm' }).code;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const links = await load(fs.readFileSync(new URL('../src/pages/records/services/weread-links.ts', import.meta.url), 'utf8'));

test('微信读书书籍 ID 与网页 hash 分离，保留长 ID，拒绝注入', () => {
  assert.equal(links.wereadAppLink('9223372036854775807'), 'weread://reading?bId=9223372036854775807&style=1');
  for (const value of ['', undefined, '1&bId=2', '1#Intent;package=evil', '1/2']) assert.equal(links.wereadAppLink(value), '');
  assert.equal(links.wereadWebLink('https://weread.qq.com/book-detail?type=1&v=mock-hash'), 'https://weread.qq.com/web/reader/mock-hash');
  for (const value of ['javascript:alert(1)', 'https://weread.qq.com.evil.test/book', 'https://user@weread.qq.com/web/reader/1', 'https://weread.qq.com/book-detail?v=', 'https://weread.qq.com/book-detail?v=%ZZ']) assert.equal(links.wereadWebLink(value), '');
});

test('手机浏览器即时唤起及安全的网页回退，桌面 UA 不误判', () => {
  const web = 'https://weread.qq.com/web/reader/mock-hash';
  assert.match(links.wereadBrowserLink('123', 'Android Chrome', web), new RegExp('^intent://reading\\?bId=123&style=1#Intent;'));
  assert.ok(links.wereadBrowserLink('123', 'Android Chrome', web).includes(`S.browser_fallback_url=${encodeURIComponent(web)};end`));
  assert.ok(!links.wereadBrowserLink('123', 'Android Chrome', 'https://evil.test').includes('fallback'));
  for (const ua of ['iPhone Safari', 'Android MicroMessenger']) assert.equal(links.wereadBrowserLink('123', ua, web), links.wereadAppLink('123'));
  assert.equal(links.isMobileBrowser('Macintosh', 5), true);
  assert.equal(links.isMobileBrowser('Macintosh', 0), false);
  assert.equal(links.isMobileBrowser('Windows', 5), false);
});

test('Android 原生入口指定微信读书包；未安装/系统拒绝可回退，非法目标不启动', async () => {
  let source = fs.readFileSync(new URL('../src/uni_modules/aio-weread-launcher/utssdk/app-android/index.uts', import.meta.url), 'utf8');
  source = source.replace(/^import .*$/gm, '');
  const mock = `
    export const calls = [];
    export const state = { fail: false };
    class Intent { static ACTION_VIEW = 'view'; constructor(action, uri) { this.action = action; this.uri = uri; } setPackage(value) { this.packageName = value; } }
    const Uri = { parse(value) { const u = new URL(value); return { value, getScheme: () => u.protocol.slice(0,-1), getHost: () => u.hostname, getUserInfo: () => u.username || u.password || null }; } };
    const UTSAndroid = { getUniActivity() { return { startActivity(intent) { if (state.fail) throw Error('not installed'); calls.push(intent); } }; } };
  `;
  const native = await load(mock + source);
  assert.equal(native.openWereadBook('123'), true);
  assert.equal(native.calls[0].packageName, 'com.tencent.weread');
  assert.equal(native.calls[0].uri.value, 'weread://reading?bId=123&style=1');
  assert.equal(native.openWereadBook('1&evil=1'), false);
  assert.equal(native.openWereadWeb('https://evil.test'), false);
  assert.equal(native.openWereadWeb('https://user@weread.qq.com/'), false);
  native.state.fail = true;
  assert.equal(native.openWereadBook('123'), false);
  assert.equal(native.openWereadWeb('https://weread.qq.com/web/reader/mock'), false);
  native.state.fail = false;
  assert.equal(native.openWereadWeb('https://weread.qq.com/web/reader/mock'), true);
  assert.equal(native.calls.length, 2);
});

async function pageRuntime(platform, ua = '') {
  let source = parse(fs.readFileSync(new URL('../src/pages/records/weread.uvue', import.meta.url), 'utf8')).descriptor.scriptSetup.content;
  const active = [true];
  source = source.split('\n').filter(line => {
    const start = line.match(/\/\/ #if(n?)def (.+)/);
    if (start) { active.push(active.at(-1) && (start[1] ? start[2] !== platform : start[2] === platform)); return false; }
    if (line.includes('// #endif')) { active.pop(); return false; }
    return active.at(-1);
  }).join('\n').replace(/^import[\s\S]*?from ['"][^'"]+['"];?/gm, '');
  const helper = fs.readFileSync(new URL('../src/pages/records/services/weread-links.ts', import.meta.url), 'utf8').replace(/export /g, '');
  const dates = fs.readFileSync(new URL('../src/services/time-format.ts', import.meta.url), 'utf8').replace(/export /g, '');
  const mocks = `
    export const calls = []; export const state = { nativeOK: true };
    const ref = value => ({ value }), computed = get => ({ get value() { return get(); } });
    const useAppLayout = () => ({ appGridItem: () => ({}) });
    const onShow = () => {}, createRecordScope = () => ({ wait: value => value });
    const navigator = { userAgent: ${JSON.stringify(ua)}, maxTouchPoints: 0 };
    const window = { location: { assign: url => calls.push(['scheme', url]) }, open: url => { calls.push(['window', url]); return { location: { replace: link => calls.push(['replace', link]) }, close: () => {} }; } };
    const uni = { showToast: value => calls.push(['toast', value]), setClipboardData: value => calls.push(['copy', value.data]) };
    const openWereadBook = id => { calls.push(['native', id]); return state.nativeOK; };
    const openWereadWeb = url => { calls.push(['native-web', url]); return true; };
    const fetchWereadBookLink = async id => { calls.push(['query', id]); return { deepLink: 'https://weread.qq.com/book-detail?type=1&v=mock-hash' }; };
  `;
  return load(mocks + helper + dates + source + '\nexport { openRankBook, openWebBook, showWebFallback, bookLinkErrors, date, mode, timestamp, readingPeriod };');
}

test('实际页面统计日期不依赖 Android locale，上海零点有效且拒绝非法日期', async () => {
  const page = await pageRuntime('APP-ANDROID');
  assert.match(page.date.value, /^\d{4}-\d{2}-\d{2}$/);
  page.date.value = '2026-10-04';
  assert.equal(page.timestamp(), Date.parse('2026-10-03T16:00:00Z') / 1000);
  const monthBoundary = Date.parse('2026-09-30T16:00:00Z') / 1000;
  assert.equal(page.readingPeriod(monthBoundary), '10月');
  page.mode.value = '月';
  assert.equal(page.readingPeriod(monthBoundary), '10/1');
  page.mode.value = '累计';
  assert.equal(page.readingPeriod(monthBoundary), '2026年');
  page.mode.value = '年';
  for (const value of ['10/4/2026', '2026-02-30', '', 'NaN']) {
    page.date.value = value;
    assert.throws(() => page.timestamp(), /有效日期/);
  }
  page.mode.value = '累计';
  assert.equal(page.timestamp(), 0);
});

test('实际页面手机 H5 使用点击内唤起；网页回退按需查询并打开解析后的阅读页', async () => {
  const page = await pageRuntime('WEB', 'Android Chrome');
  const book = { bookId: '123' };
  await page.openRankBook(book);
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0][0], 'scheme');
  assert.match(page.calls[0][1], /^intent:\/\/reading\?bId=123/);
  assert.equal(page.showWebFallback.value['123'], true);
  await page.openWebBook(book);
  assert.deepEqual(page.calls.slice(1), [['window', 'about:blank'], ['query', '123'], ['replace', 'https://weread.qq.com/web/reader/mock-hash']]);
});

test('实际页面 Android 无需先请求网页；唤起失败保留当前页面及网页回退', async () => {
  const page = await pageRuntime('APP-ANDROID');
  const book = { bookId: '123' };
  await page.openRankBook(book);
  assert.deepEqual(page.calls, [['native', '123']]);
  page.state.nativeOK = false;
  await page.openRankBook(book);
  assert.equal(page.showWebFallback.value['123'], true);
  assert.match(page.bookLinkErrors.value['123'], /无法打开/);
  await page.openWebBook(book);
  assert.deepEqual(page.calls.slice(2), [['query', '123'], ['native-web', 'https://weread.qq.com/web/reader/mock-hash']]);
});
