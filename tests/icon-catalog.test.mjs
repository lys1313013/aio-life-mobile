import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(name) {
  return JSON.parse(readFileSync(new URL(`../src/services/icons/${name}.json`, import.meta.url), 'utf8'));
}

test('发布图标目录去重后保留所有图形、覆盖顺序和运动预设', () => {
  const categories = read('category-icons');
  const actions = read('action-icons');
  const business = read('business-icons');
  const catalog = read('catalog.generated');
  assert.deepEqual(catalog.icons, { ...categories.icons, ...actions.icons, ...business.icons });
  assert.deepEqual(catalog.exercisePresets, business.exercisePresets);
  assert.deepEqual(catalog.sources, [...categories.sources, ...actions.sources, ...business.sources]);
  const originals = [categories, actions, business].reduce((size, item) => size + JSON.stringify(item.icons).length, 0);
  assert.ok(originals - JSON.stringify(catalog.icons).length > 50_000, '重复图标应在发布前去除');
  const source = readFileSync(new URL('../src/services/icons/catalog.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/import .* from/g) || []).length, 1, '运行时仅导入合并后的目录');
});
