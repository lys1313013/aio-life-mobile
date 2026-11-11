import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformSync } from 'esbuild';

const source = await readFile(new URL('../src/services/goal-query-variables.ts', import.meta.url), 'utf8');
const { queryVariables, readVariableValues, writeVariableValues } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64'));
const examples = JSON.parse(await readFile(new URL('./fixtures/goal-queries.json', import.meta.url), 'utf8'));

test('三个目标保持接口契约，按名称筛选时直接提交名称，日期只使用已有明确绑定', () => {
  for (const example of examples) {
    const values = readVariableValues(example.progressQuery, example.progressVariables, example.progressVariableBindings);
    const payload = writeVariableValues(example.progressQuery, values);
    assert.deepEqual(JSON.parse(payload.progressVariables), JSON.parse(example.progressVariables));
    assert.deepEqual(JSON.parse(payload.progressVariableBindings), JSON.parse(example.progressVariableBindings));
  }
  const example = examples[1];
  const values = readVariableValues(example.progressQuery, example.progressVariables, example.progressVariableBindings);
  values.categoryName.value = '午休';
  assert.deepEqual(JSON.parse(writeVariableValues(example.progressQuery, values).progressVariables), { categoryName: '午休' });
});

test('不识别业务字段、不推断日期来源，缺少必填值时阻止预览', () => {
  const query = examples[1].progressQuery;
  assert.deepEqual(queryVariables(query).map(variable => variable.name), ['start', 'end', 'categoryName']);
  assert.deepEqual(queryVariables(query.replace('category:{name:', 'unknown:{field:')), queryVariables(query));
  const values = readVariableValues(query, '{}', '{}');
  assert.equal(values.start.source, 'fixed');
  values.start.source = 'goal.startDate'; values.end.source = 'goal.endDateExclusive';
  assert.throws(() => writeVariableValues(query, values), /请填写categoryName/);
});

test('注释和字符串中的假变量不生成字段，零、false、对象、列表和自定义类型保持正确', () => {
  const query = '# $fake\nquery P($n:Int!,$flag:Boolean!,$where:Filter!,$order:Direction,$ids:[String!]!,$text:String = "($fake:String!)"){ rows(where:$where){id} }';
  const saved = { n: 0, flag: false, where: { name: { _eq: '休息' } }, order: 'Desc', ids: ['9223372036854775806'] };
  const values = readVariableValues(query, JSON.stringify(saved), '{}');
  assert.deepEqual(JSON.parse(writeVariableValues(query, values).progressVariables), saved);
  values.n.value = '1.5';
  assert.throws(() => writeVariableValues(query, values), /有效数字/);
});
