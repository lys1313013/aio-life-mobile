import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';

const source = await readFile(new URL('../src/services/display-error.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const { displayError } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('服务端缺类和数据库异常只展示可重试的业务说明', () => {
  for (const value of [
    'Handler dispatch failed: java.lang.NoClassDefFoundError: UserConvertor',
    'NoClassDefFoundError: StorageObjectVO',
    'SQLSTATE 42000: SQLSyntaxErrorException',
    'Caused by: org.springframework.beans.BeanCreationException',
    'unexpected failure\n at top.aiolife.UserService.list(UserService.java:42)',
  ]) assert.equal(displayError(value), '服务暂时不可用，请稍后重试');
});

test('保留用户可以据此处理的业务错误，不吞掉普通技术名词', () => {
  for (const value of ['请选择分类', '没有权限访问，请联系管理员', '登录已过期，请重新登录', '模拟加载失败', 'Java 学习任务名称不能为空', '请求超时，请重试']) {
    assert.equal(displayError(value), value);
  }
  assert.equal(displayError(''), '');
});
