import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/dashboard-format.ts', import.meta.url), 'utf8');
const { timeSummary, webLink } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('时迹闭区间含末分钟，按父类聚合，保留字符串 ID 与最近记录顺序', () => {
  const result = timeSummary([{ id: '9223372036854775807', name: '学习', color: '#00f' }, { id: '2', parentId: '9223372036854775807', name: '阅读' }], [{ id: 'a', categoryId: '2', startTime: 0, endTime: 59 }, { id: 'b', categoryId: '2', startTime: 90, endTime: 90 }]);
  assert.equal(result.total, '1h1m');
  assert.deepEqual(result.groups.map(g => [g.id, g.minutes]), [['9223372036854775807', 61]]);
  assert.equal(result.recent[0].label, '01:30  1m');
  assert.equal(result.recent[0].name, '学习 / 阅读');
  assert.equal(result.segments.length, 120);
  assert.equal(timeSummary([], []).segments.length, 0);
});
test('业务链接只接受 HTTPS 或站内路径，拒绝脚本与协议相对 URL', () => {
  assert.equal(webLink('/task/todo'), 'https://aiolife.top/#/task/todo');
  assert.equal(webLink('https://github.com/example'), 'https://github.com/example');
  for (const path of ['javascript:alert(1)', '//example.com', 'http://example.com', null]) assert.equal(webLink(path), '');
});
