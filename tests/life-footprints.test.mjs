import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
async function moduleAt(path) {
  const { code } = await transform(await readFile(new URL(path, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { PRESENT_DATE, timeLabel, validDate, draftPayload, emptyDraft, groupLocations, groupPeriods } = await moduleAt('../src/pages/life-footprints/model.ts');
const { pickQuery, minimalRequestPayload } = await moduleAt('../src/services/api-payload.ts');
const draft = () => ({ ...emptyDraft(), startDate: '2016-12-30', endDate: '2016-12-31', placeName: ' 住所 ', longitude: 120.127128, latitude: 30.273297, confirmed: true });
test('生活足迹仅接受完整日期并校验闰年和起止顺序', () => {
  assert.equal(draftPayload(draft()).endDate, '2016-12-31');
  assert.equal(validDate('2024-02-29'), true);
  assert.doesNotThrow(() => draftPayload({ ...draft(), endDate: '2016-12-30' }));
  for (const value of ['2016', '2024-02', '2023-02-29', '2020-13-01', '0000-01-01', '0999-01-01']) {
    assert.equal(validDate(value), false);
    assert.throws(() => draftPayload({ ...draft(), startDate: value }));
    assert.throws(() => draftPayload({ ...draft(), endDate: value }));
  }
  assert.throws(() => draftPayload({ ...draft(), startDate: '2099-01-01' }));
  assert.throws(() => draftPayload({ ...draft(), endDate: '2016-12-29' }));
});
test('生活足迹选点确认、清空和至今契约', () => {
  assert.throws(() => draftPayload({ ...draft(), confirmed: false }));
  assert.throws(() => draftPayload({ ...draft(), longitude: NaN }));
  const payload = draftPayload({ ...draft(), endDate: PRESENT_DATE, address: '', note: '' });
  assert.equal(payload.endDate, PRESENT_DATE); assert.equal(payload.address, null); assert.equal(payload.note, null);
  assert.equal(payload.coordinateSystem, 'GCJ02');
  assert.equal(Object.hasOwn(payload, 'confirmed'), false);
  assert.equal(Object.hasOwn(payload, 'ongoing'), false);
  assert.equal(Object.hasOwn(payload, 'requestKey'), false);
  assert.equal(Object.hasOwn(payload, 'version'), false);
  assert.equal(payload.regionCode, null);
  assert.equal(timeLabel(payload), '2016.12.30 — 至今');
  assert.throws(() => draftPayload({ ...draft(), endDate: '' }));
  assert.throws(() => draftPayload({ ...draft(), endDate: '9999-12-30' }));
  assert.throws(() => draftPayload({ ...draft(), startDate: PRESENT_DATE, endDate: PRESENT_DATE }));
  assert.equal(timeLabel(draft()), '2016.12.30 — 2016.12.31');
  const outgoing = minimalRequestPayload('/life-footprints', 'POST', { ...payload, id: '9223372036854775807', userId: 'other', ongoing: true, requestKey: 'obsolete-key', version: 1 });
  assert.equal(Object.hasOwn(outgoing, 'version'), false);
  assert.equal(Object.hasOwn(outgoing, 'id'), false); assert.equal(Object.hasOwn(outgoing, 'userId'), false);
  assert.equal(Object.hasOwn(outgoing, 'ongoing'), false); assert.equal(Object.hasOwn(outgoing, 'requestKey'), false);
});

const { regionAddress, regionName, regionCity } = await moduleAt('../src/pages/life-footprints/regions.ts');
test('地区路径保留字符串编码，解析拼入完整地区且允许任意级选择', () => {
  const path = [{ code: '33', name: '浙江省', level: 1 }, { code: '3301', name: '杭州市', level: 2 }, { code: '330106', name: '西湖区', level: 3 }, { code: '330106012', name: '三墩镇', level: 4 }];
  assert.equal(regionName(path), '浙江省杭州市西湖区三墩镇');
  assert.equal(regionAddress(path, ' 甲路1号 '), '浙江省杭州市西湖区三墩镇甲路1号');
  assert.equal(regionAddress(path, '浙江省杭州市西湖区甲路1号'), '浙江省杭州市西湖区甲路1号');
  assert.equal(regionCity(path), '杭州市');
  assert.equal(regionCity(path.slice(0, 1)), '浙江省');
  assert.equal(regionAddress([], '美国某地'), '美国某地');
  assert.equal(draftPayload({ ...draft(), regionCode: '330106012' }).regionCode, '330106012');
  assert.equal(minimalRequestPayload('/life-footprints', 'POST', { ...draftPayload(draft()), regionCode: '330106012' }).regionCode, '330106012');
  assert.deepEqual(pickQuery('/system/regions', { parentCode: '330106', userId: 'other' }), { parentCode: '330106' });
});
test('地图聚合保留全部字符串ID，放大后展开，同一坐标仍保留多条', () => {
  const a = { ...draftPayload(draft()), id: '9223372036854775807' }, b = { ...a, id: '9223372036854775806', longitude: a.longitude + .01 };
  assert.equal(groupLocations([a, b], 4).length, 1); assert.equal(groupLocations([a, b], 18).length, 2);
  assert.deepEqual(groupLocations([a, { ...a, id: b.id }], 22)[0].records.map(r => r.id), [a.id, b.id]);
});
test('地址逆解析请求保留数值经纬度且剔除身份字段', () => {
  assert.deepEqual(pickQuery('/life-footprints/map/reverse', { longitude: 120, latitude: 30, userId: 'other' }), { longitude: 120, latitude: 30 });
});

const { wgs84ToGcj02, gcj02ToWgs84 } = await moduleAt('../src/pages/life-footprints/coordinates.ts');
test('WGS84 底图与 GCJ02 记录明确转换，国内往返精度和境外不偏移', () => {
  const point = { longitude: 116.404, latitude: 39.915 };
  const converted = wgs84ToGcj02(point);
  assert(Math.abs(converted.longitude - 116.410244499) < 1e-8);
  assert(Math.abs(converted.latitude - 39.916404282) < 1e-8);
  const back = gcj02ToWgs84(converted);
  assert(Math.abs(back.longitude - point.longitude) < 1e-8);
  assert(Math.abs(back.latitude - point.latitude) < 1e-8);
  const overseas = { longitude: -74.006, latitude: 40.7128 };
  assert.deepEqual(wgs84ToGcj02(overseas), overseas);
  assert.deepEqual(gcj02ToWgs84(overseas), overseas);
});


test('时间段列表仅合并相同起止日期，不丢失重复地点、重叠时间段及大整数 ID', () => {
  const base = draftPayload(draft());
  const first = { ...base, id: '9223372036854775807' };
  const second = { ...first, id: '9223372036854775806' };
  const overlap = { ...first, id: '9223372036854775805', endDate: PRESENT_DATE };
  const groups = groupPeriods([first, overlap, second]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].records.map(record => record.id), [overlap.id]);
  assert.deepEqual(groups[1].records.map(record => record.id), [second.id, first.id]);
  assert.equal(timeLabel(groups[0]), '2016.12.30 — 至今');
  assert.deepEqual(groupPeriods([]), []);
});
