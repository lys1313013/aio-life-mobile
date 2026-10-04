export function messageOrder(a: any, b: any) {
  return String(a.createTime || '').replace('T', ' ').localeCompare(String(b.createTime || '').replace('T', ' '));
}
export function conversationMessages(rows: any[], own: string, peer: string) {
  return rows.filter((item) =>
    (String(item.senderId) === own && String(item.receiverId) === peer) ||
    (String(item.senderId) === peer && String(item.receiverId) === own),
  ).sort(messageOrder);
}
export function groupConversations(rows: any[], own: string, users: Record<string, any>) {
  const groups: Record<string, any> = {};
  for (const item of [...rows].sort(messageOrder)) {
    if (String(item.senderId) !== own && String(item.receiverId) !== own) continue;
    const id = String(item.senderId) === own ? String(item.receiverId) : String(item.senderId);
    if (!groups[id]) groups[id] = {
      id, name: users[id]?.nickname || id, avatar: users[id]?.avatarUrl || users[id]?.avatar || '',
      unread: 0, last: '', time: '',
    };
    if (!item.isRead && String(item.receiverId) === own) groups[id].unread++;
    groups[id].last = item.content || item.title || '';
    groups[id].time = item.createTime || '';
  }
  return Object.values(groups).sort((a, b) => messageOrder({ createTime: b.time }, { createTime: a.time }));
}
