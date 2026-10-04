// 会员页与系统平台管理共用的小型展示契约，不包含业务请求或静态 Logo 资源。
export const memberCategories = ['video', 'music', 'shopping', 'cloud', 'study', 'game', 'other'];
export const memberCategoryLabels = ['视频', '音乐', '购物', '云盘', '学习', '游戏', '其他'];
export const memberCategoryIcons = ['ant-design:video-camera-outlined', 'ant-design:customer-service-outlined', 'ant-design:shopping-outlined', 'ant-design:cloud-outlined', 'ant-design:read-outlined', 'ant-design:trophy-outlined', 'ant-design:appstore-outlined'];
export function providerIconPath(key) {
  return typeof key === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) ? '/membership/provider-icons/' + key : '';
}
export function readMemberProviders(rows) {
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !/^\d+$/.test(row.id) || typeof row.name !== 'string' || typeof row.code !== 'string' || !memberCategories.includes(row.category) || ![0, 1].includes(row.isEnabled))) throw Error('会员平台数据异常，请重试');
  return rows;
}
// 当前记录的停用平台仍可保留，但不能成为新记录的候选项。
export function editableProviders(rows, record) {
  if (!record?.providerId || rows.some(row => row.id === record.providerId)) return rows;
  return [...rows, { id: record.providerId, name: record.providerName || record.provider || '原平台', category: record.category, iconKey: record.providerIconKey, isEnabled: 0 }];
}
