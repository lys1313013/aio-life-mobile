import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile(new URL('../src/pages/messages/services/conversations.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { groupConversations, conversationMessages } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const own = '9223372036854775807', peer = '9223372036854775806';
const rows = [
  { id: '3', senderId: own, receiverId: peer, content: '最新回复', createTime: '2026-10-04 10:02:00', isRead: false },
  { id: '1', senderId: peer, receiverId: own, content: '第一条', createTime: '2026-10-04 10:00:00', isRead: false },
  { id: '4', senderId: '8', receiverId: own, content: '另一个会话', createTime: '2026-10-04 11:00:00', isRead: true },
  { id: '2', senderId: peer, receiverId: own, content: '第二条', createTime: '2026-10-04 10:01:00', isRead: false },
  { id: '5', senderId: peer, receiverId: '8', content: '不属于当前用户', createTime: '2026-10-04 12:00:00', isRead: false },
];
test('会话按最新消息排序，末条预览不依赖接口顺序，未读仅统计收件', () => {
  const grouped = groupConversations(rows, own, { [peer]: { nickname: '模拟好友', avatarUrl: '/avatar.png' } });
  assert.deepEqual(grouped.map(item => item.id), ['8', peer]);
  assert.equal(grouped[1].last, '最新回复');
  assert.equal(grouped[1].unread, 2);
  assert.equal(grouped[1].name, '模拟好友');
  assert.equal(grouped[1].avatar, '/avatar.png');
  assert.deepEqual(rows.map(item => item.id), ['3', '1', '4', '2', '5']);
});
test('对话只包含当前用户与联系人的双向消息，按时间升序且保留大整数 ID', () => {
  assert.deepEqual(conversationMessages(rows, own, peer).map(item => item.id), ['1', '2', '3']);
  assert.equal(groupConversations(rows, own, {})[1].name, peer);
});
