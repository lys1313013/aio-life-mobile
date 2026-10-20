import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/pages/body-profile/model.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { calculateBmi, emptyProfile, parseMeasurement, profilePayload, shoeText } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('BMI自动计算，不足或无效数据为未填写', () => {
  assert.equal(calculateBmi(178, 72), 22.7);
  assert.equal(calculateBmi(180, 80), 24.7);
  for (const value of [null, 0, -1, NaN, Infinity]) {
    assert.equal(calculateBmi(value, 72), null);
    assert.equal(calculateBmi(178, value), null);
  }
});
test('当前档案完整覆盖且不提交身份、BMI和审计字段', () => {
  const data = profilePayload({ ...emptyProfile(), id: '9223372036854775807', version: 2, topSize: ' L ', upperArmCm: 32.5, shoeSize: '42' });
  assert.equal(data.version, 2);
  assert.equal(data.upperArmCm, 32.5);
  assert.equal(data.heightCm, null);
  assert.equal(data.topSize, 'L');
  assert.equal(data.shoeSystem, 'EU');
  for (const key of ['id', 'bmi', 'updateTime', 'userId']) assert.equal(Object.hasOwn(data, key), false);
  assert.equal(profilePayload({ ...emptyProfile(), shoeSize: '' }).shoeSize, null);
});
test('数字输入有真实转换和校验，鞋码保留制式', () => {
  assert.equal(parseMeasurement('32.5', 'upperArmCm'), 32.5);
  assert.equal(parseMeasurement(' ', 'upperArmCm'), null);
  for (const value of ['0', '-1', '32.55', '1e2', 'NaN']) assert.throws(() => parseMeasurement(value, 'upperArmCm'));
  assert.throws(() => parseMeasurement('100', 'bodyFatPercent'));
  assert.equal(shoeText({ ...emptyProfile(), shoeSize: '42' }), '42 码');
  assert.equal(shoeText({ ...emptyProfile(), shoeSize: '265', shoeSystem: 'CN' }), '265 毫米');
});
