import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const addressSource = source.slice(source.indexOf('let baseURL ='), source.indexOf('export function request<'));

async function compileAddress(env, web = false) {
  const platformSource = web
    ? addressSource
    : addressSource.replace(/\/\/ #ifdef WEB[\s\S]*?\/\/ #endif/, '');
  const { code } = await transform(platformSource, {
    loader: 'ts', format: 'esm',
    define: { 'import.meta.env': JSON.stringify(env) },
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('微信/App 生产构建未传环境变量时连接线上 API，开发构建仍连接本机', async () => {
  const production = await compileAddress({ PROD: true });
  const development = await compileAddress({ PROD: false });
  assert.equal(production.apiUrl('/auth/login'), 'https://aiolife.top/api/auth/login');
  assert.equal(development.apiUrl('/auth/login'), 'http://127.0.0.1:45678/api/auth/login');
});

test('显式 API 环境配置仍可覆盖默认地址，并去除尾部斜杠', async () => {
  for (const PROD of [true, false]) {
    const configured = await compileAddress({ PROD, VITE_API_BASE_URL: 'https://staging.example.test/api/' });
    assert.equal(configured.apiUrl('/user/info'), 'https://staging.example.test/api/user/info');
  }
});

test('Web 构建继续使用同源 /api 或独立 Web 配置', async () => {
  const web = await compileAddress({ PROD: true }, true);
  assert.equal(web.apiUrl('/auth/login'), '/api/auth/login');
  const configured = await compileAddress({ PROD: true, VITE_WEB_API_BASE_URL: 'https://web.example.test/api/' }, true);
  assert.equal(configured.apiUrl('/auth/login'), 'https://web.example.test/api/auth/login');
});
