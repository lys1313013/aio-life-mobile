import { request } from '../api.ts'
import { categoryPayload, readCategoryList, stringId } from './contract.ts'
export async function listCategories(admin = false) {
  if (admin) return readCategoryList(await request('/timeTrackerCategory/admin/list'))
  const [visible, hidden] = await Promise.all([request('/timeTrackerCategory/list'), request('/timeTrackerCategory/hidden')])
  return [...readCategoryList(visible), ...readCategoryList(hidden).map(row => ({ ...row, isEnabled: 0 }))]
}
export function saveCategory(form, original, admin = false) {
  const data = categoryPayload(form, original, admin)
  const path = '/timeTrackerCategory' + (admin ? '/admin' : '') + (admin && original ? '/' + stringId(original.id) : '')
  return request(path, original ? 'PUT' : 'POST', data)
}
export function changeCategory(row, changes, admin = false) {
  if (admin) return request('/timeTrackerCategory/admin/' + stringId(row.id), 'PUT', { ...row, ...changes })
  return request('/timeTrackerCategory', 'PUT', { id: row.templateId || stringId(row.id), templateId: row.templateId || (row.userId === '0' ? row.id : undefined), ...changes })
}
export function deleteCategory(row, admin = false) { return request('/timeTrackerCategory' + (admin ? '/admin' : '') + '/' + stringId(row.id), 'DELETE') }
export function sortCategories(rows) { return request('/timeTrackerCategory/reSort', 'POST', rows) }
