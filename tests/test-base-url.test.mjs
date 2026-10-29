import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('预览配置和浏览器 fixture 随 E2E_BASE_URL 使用独立测试端口', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = execFileSync(process.execPath, ['-e', `
    const { baseURL } = require('./tests/support/base-url.cjs');
    const config = require('./playwright.config.js');
    console.log(JSON.stringify({ baseURL, configured: config.use.baseURL, preview: config.webServer.command }));
  `], { cwd: root, env: { ...process.env, E2E_BASE_URL: 'http://127.0.0.1:5196/', AIO_E2E_PREBUILT: '0' }, encoding: 'utf8' });
  const value = JSON.parse(result);
  assert.equal(value.baseURL, 'http://127.0.0.1:5196');
  assert.equal(value.configured, value.baseURL);
  assert.match(value.preview, /--port 5196 --strictPort/);
});
