import { request } from '../../../services/api.ts';
import { memberCategories, providerIconPath, readMemberProviders } from '../../../services/membership-provider.ts';
import { recordId } from '../../../services/records/contracts.ts';
const path = '/system/membership-providers';
export async function listMembershipProviders() { return readMemberProviders(await request(path)); }
export async function listMembershipIcons() {
  const rows = await request<any[]>('/membership/provider-icons');
  if (!Array.isArray(rows) || rows.some(row => !row || !providerIconPath(row.key) || typeof row.name !== 'string')) throw Error('平台图标数据异常，请重试');
  return rows;
}
export function membershipProviderPayload(form) {
  const name = String(form.name || '').trim(), code = String(form.code || '').trim();
  if (!name || name.length > 100) throw Error('请输入不超过100字的平台名称');
  if (!/^[a-z][a-z0-9_]{0,49}$/.test(code)) throw Error('编码须以小写字母开头，仅含小写字母、数字和下划线，最多50位');
  if (!memberCategories.includes(form.category)) throw Error('请选择分类');
  if (form.iconKey && !providerIconPath(form.iconKey)) throw Error('请选择内置图标');
  const sortOrder = typeof form.sortOrder === 'string' && /^\d+$/.test(form.sortOrder.trim()) ? Number(form.sortOrder) : form.sortOrder;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999999) throw Error('排序须为0至999999的整数');
  if (![0, 1].includes(form.isEnabled)) throw Error('启用状态无效');
  return { name, code, category: form.category, iconKey: form.iconKey || null, sortOrder, isEnabled: form.isEnabled };
}
export async function saveMembershipProvider(form, original = null) {
  const result = await request(path + (original ? '/' + recordId(original.id) : ''), original ? 'PUT' : 'POST', membershipProviderPayload(form));
  return readMemberProviders([result])[0];
}
export function deleteMembershipProvider(id) { return request(path + '/' + recordId(id), 'DELETE'); }
