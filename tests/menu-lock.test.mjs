import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/life-catalog.ts', import.meta.url), 'utf8');
const { lockedMenuPaths, matchesNativeMenu } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('完整字符串 ID 与父菜单锁，兼容新旧 Web 路由', () => {
  const tree = [{ path: '/my-hub', meta: { menuId: '9223372036854775807' }, children: [
    { path: '/my-hub/memo', meta: { menuId: 'memo' } },
    { path: '/my-hub/think', meta: { menuId: 'think' } },
  ] }];
  assert.deepEqual(lockedMenuPaths('/pages/records/notes?kind=memo&editId=5', tree, ['9223372036854775807']), ['/my-hub/memo']);
  assert.deepEqual(lockedMenuPaths('/pages/records/notes?kind=think', tree, ['memo']), []);
  assert.deepEqual(lockedMenuPaths('/pages/records/notes?kind=memo', tree, ['9223372036854775806']), []);
  assert.equal(matchesNativeMenu('/pages/records/notes?kind=memo', '/record/memo'), true);
  assert.throws(() => lockedMenuPaths('/pages/records/notes?kind=memo', tree, [123]));
});

test('共用页面按模式隔离菜单锁，详情/新增参数保留', () => {
  assert.equal(matchesNativeMenu('/pages/records/library?kind=movie', '/record/read'), false);
  assert.equal(matchesNativeMenu('/pages/records/library?kind=read&create=1', '/record/read'), true);
  assert.equal(matchesNativeMenu('/pages/admin/index?kind=menus', '/system/user'), false);
  assert.equal(matchesNativeMenu('/pages/tasks/todo?detailId=123&taskId=456', '/task-center/todo'), true);
});

test('新增系统管理页面继承父菜单锁并隔离各自叶菜单', () => {
  const tree = [{ path: '/system', meta: { menuId: 'system' }, children: [
    { path: '/system/bank-card-covers', meta: { menuId: 'covers' } },
    { path: '/system/storage', meta: { menuId: 'storage' } },
  ] }];
  assert.deepEqual(lockedMenuPaths('/pages/admin/bank-card-covers', tree, ['system']), ['/system/bank-card-covers']);
  assert.deepEqual(lockedMenuPaths('/pages/admin/storage', tree, ['system']), ['/system/storage']);
  assert.deepEqual(lockedMenuPaths('/pages/admin/storage', tree, ['covers']), []);
});
