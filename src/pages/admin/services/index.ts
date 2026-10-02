import { missingRequired } from '../../../services/form-required.ts';
import { request } from '../../../services/api.ts'
import { specs, adminPayload } from './specs.ts'
import { flattenMenus, queryPath, readPage, stringId, protectedMenu, validateConfig } from '../../../services/admin/contract.ts'
export async function queryAdmin(kind, params) {
  const spec = specs[kind]
  if (!spec) throw Error('未知管理页面')
  const data = await request(queryPath(spec.query, spec.tree ? {} : params))
  if (spec.tree) return { items: flattenMenus(data).map(row => ({ ...row, title: row.meta?.title || row.name })), total: flattenMenus(data).length }
  if (spec.array) {
    if (!Array.isArray(data)) throw Error('配置数据异常')
    return { items: data, total: data.length }
  }
  return readPage(data, spec.id)
}
export async function saveAdmin(kind, form, original) {
  const spec = specs[kind], data = adminPayload(kind, form, original)
  if (original) stringId(original[spec.id])
  for (const key of ['dictId','parentId']) if (data[key]) stringId(data[key])
  return request(spec.base + (original && !spec.updateRoot ? '/' + stringId(original[spec.id]) : ''), original ? 'PUT' : 'POST', data)
}
export function deleteAdmin(kind, row) {
  const spec = specs[kind]
  if (kind === 'menus' && protectedMenu(row)) throw Error('核心管理菜单不可删除')
  if (kind === 'user-dict' && row.userId !== '0') throw Error('只能删除基础值')
  return request(spec.base + '/' + stringId(row[spec.id]), 'DELETE')
}
export function setMenuStatus(row) {
  if (protectedMenu(row)) throw Error('核心管理菜单必须启用')
  return request('/menu/admin/' + stringId(row.id) + '/status','PUT',{ status: row.status === 1 ? 0 : 1 })
}
export function setMenuSort(row, sort) { return request('/menu/admin/' + stringId(row.id) + '/sort','PUT',{ sort }) }
export function sortUserDict(row, target, delta) {
  if (row.dictType !== target.dictType || row.userId !== '0' || target.userId !== '0') throw Error('只能在同一字典类型下调整基础值顺序')
  return request('/userDictData/admin/reSort','POST',{ dictType: row.dictType, dragId: stringId(row.id), targetId: stringId(target.id), position: delta < 0 ? 'before' : 'after' })
}
export function saveConfig(row, value) { return request('/system-config/' + encodeURIComponent(row.configKey),'PUT',{ configValue: validateConfig(row, value) }) }
export function feedbackDetail(row) { return request('/feedback/admin/' + stringId(row.id)) }
export function replyFeedback(row, content, fileIds) {
  if (missingRequired('reply', { content })) throw Error('请输入回复内容')
  return request('/feedback/admin/' + stringId(row.id) + '/reply','POST',{ content: content.trim(), fileIds: fileIds.map(stringId) })
}
export function feedbackStatus(row, status) { return request('/feedback/admin/' + stringId(row.id) + '/status','PUT',{ status }) }
export function batchCloseFeedback(ids) { if (!ids.length) throw Error('请选择反馈'); return request('/feedback/admin/batch','POST',{ idList: ids.map(stringId), action:'CLOSE' }) }
export async function adminOptions(kind) {
  if (kind === 'dict-data') {
    const rows = []; let page = 1; let total = 1
    while (rows.length < total) { const result = readPage(await request(queryPath('/sysDictType/query',{page: page++,pageSize:100})), 'dictId'); if (!result.items.length) break; rows.push(...result.items); total = result.total }
    return rows.map(row => ({ label:row.dictName, value:row.dictId, type:row.dictType }))
  }
  if (kind === 'user-dict') return request('/userDictType/dictTypeEnum')
  if (kind === 'menus') return request('/menu/admin/role-options')
  if (kind === 'config') return request('/feedback/admin/admin-users')
  return []
}
