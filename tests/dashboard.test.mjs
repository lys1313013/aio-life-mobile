import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('../src/services/dashboard-format.ts', import.meta.url), 'utf8');
const { timeSummary, summaryDonutLabels, webLink } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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

test('圆环标注保留分类累计时长，集中扇区的标签不会重叠或越界', () => {
  const groups = [{ id: 'large', name: '休息', minutes: 430, color: '#faad14' },
    ...Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: '分类' + i, minutes: 10, color: '#00f' }))];
  const labels = summaryDonutLabels(groups);
  assert.equal(labels.length, 6);
  assert.equal(labels.find(x => x.id === 'large').duration, '7h10m');
  for (const side of ['left', 'right']) {
    const positions = labels.filter(x => x.side === side).map(x => parseFloat(x.position.top)).sort((a, b) => a - b);
    positions.forEach((top, i) => {
      assert.ok(top >= 0 && top + 24 <= 176);
      if (i) assert.ok(top - positions[i - 1] >= 27);
    });
  }
  assert.deepEqual(summaryDonutLabels([]), []);
  assert.deepEqual(summaryDonutLabels([{ id: 'zero', minutes: 0 }]), []);
});
test('最近记录保留全部明细供滚动查看，重复分类仍分别保留', () => {
  const records = Array.from({ length: 8 }, (_, i) => ({ id: String(i), categoryId: '1', startTime: i * 10, endTime: i * 10 + 9 }));
  const result = timeSummary([{ id: '1', name: '阅读', color: '#faad14' }], records);
  assert.equal(result.recent.length, 8);
  assert.deepEqual(result.recent.map(x => x.id), ['7', '6', '5', '4', '3', '2', '1', '0']);
  assert.equal(result.recent[0].startLabel, '01:10');
  assert.equal(result.recent[0].durationLabel, '10m');
  assert.equal(result.recent[0].shortName, '阅读');
  assert.equal(result.groups[0].minutes, 80);
});

test('首页圆环的密集标签引导线始终绕行圆环外侧，不穿过其他分类', () => {
  const groups = [
    ['休息', 476], ['项目', 437], ['吃饭', 145], ['娱乐', 62], ['交通', 15], ['卫生', 11],
  ].map(([name, minutes], index) => ({ id: String(index), name, minutes, color: '#427bea' }));
  for (const rows of [groups, groups.slice().reverse(), [{ id: 'single', name: '全天', minutes: 1440 }]]) {
    for (const label of summaryDonutLabels(rows)) {
      for (let index = 1; index < label.points.length; index++) {
        const from = label.points[index - 1], to = label.points[index];
        for (let step = 0; step <= 100; step++) {
          const x = from.x + (to.x - from.x) * step / 100;
          const y = from.y + (to.y - from.y) * step / 100;
          assert.ok(Math.hypot(x - 88, y - 88) >= 54 - 1e-8, label.name + ' 引导线穿环');
        }
      }
    }
  }
});
