import { missingRequired } from '../form-required.ts';
export function stringId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('记录 ID 异常，请重新加载')
  return value
}
export function queryPath(path, params = {}) {
  const pairs = Object.entries(params).filter(([, value]) => value !== '' && value != null).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
  return path + (pairs.length ? '?' + pairs.join('&') : '')
}
export function readPage(data, idField = 'id') {
  // PageResp.total 以数字返回；读取边界暂时兼容未升级服务端的十进制字符串。
  const total = typeof data?.total === 'string' && /^\d+$/.test(data.total) ? Number(data.total) : data?.total
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(total) || total < 0) throw new Error('列表数据异常，请重试')
  for (const item of data.items) stringId(item[idField])
  return { ...data, total }
}
export function readCategoryList(data) {
  if (!Array.isArray(data)) throw new Error('分类数据异常，请重试')
  for (const item of data) {
    stringId(item.id)
    if (item.templateId != null) stringId(item.templateId)
    if (item.parentId != null) stringId(item.parentId)
  }
  return data
}
export function categoryPayload(form, original, admin = false) {
  if (missingRequired('category', form, 'name')) throw new Error('请输入分类名称')
  if (!/^#[\da-fA-F]{6}$/.test(form.color || '')) throw new Error('请输入六位颜色值，如 #427bea')
  const data = {}
  for (const key of ['id', 'parentId', 'templateId', 'name', 'color', 'icon', 'description', 'isTrackTime', 'isEnabled', 'sort', 'timeType']) if (form[key] !== undefined) data[key] = form[key]
  if (data.id != null) stringId(data.id)
  if (data.parentId != null) stringId(data.parentId)
  if (data.templateId != null) stringId(data.templateId)
  if (!admin && original && (original.userId === '0' || original.templateId)) {
    data.id = original.templateId || original.id
    data.templateId = original.templateId || original.id
    if ((data.parentId || '0') === (original.parentId || '0')) delete data.parentId
  }
  data.name = data.name.trim()
  return data
}
export function siblingSort(items, item, delta) {
  const siblings = items.filter(row => (row.parentId || '0') === (item.parentId || '0') && row.isEnabled !== 0).sort((a,b) => (a.sort || 0) - (b.sort || 0))
  const index = siblings.findIndex(row => row.id === item.id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= siblings.length) return []
  const displaced = siblings[target]; siblings[target] = siblings[index]; siblings[index] = displaced
  return siblings.map((row, sort) => ({ id: stringId(row.id), templateId: row.templateId || (row.userId === '0' ? row.id : null), sort: sort * 10 }))
}
export function protectedMenu(row) { return ['/system', '/system/menu'].includes(row.path) }
export function flattenMenus(rows, depth = 0) {
  if (!Array.isArray(rows)) throw new Error('菜单数据异常')
  return rows.flatMap(row => { stringId(row.id); return [{ ...row, depth }, ...flattenMenus(row.children || [], depth + 1)] })
}
export function validateConfig(row, value) {
  if (row.configType === 'JSON') {
    try { JSON.parse(value) } catch { throw new Error('请输入有效的 JSON 配置') }
    return value
  }
  if (row.configType === 'BOOLEAN' && !['true','false'].includes(value)) throw new Error('请选择开关状态')
  if (row.configType === 'NUMBER' && (value.trim() === '' || !Number.isFinite(Number(value)))) throw new Error('请输入有效数字')
  return value
}

export function orderCategories(rows) {
  const sorted = [...rows].sort((a,b) => (a.sort || 0) - (b.sort || 0))
  const result = [], seen = new Set()
  function visit(row) {if(seen.has(row.id)) return; seen.add(row.id); result.push(row); sorted.filter(child => child.parentId === row.id).forEach(visit)}
  sorted.filter(row => !row.parentId || row.parentId === '0' || !rows.some(parent => parent.id === row.parentId)).forEach(visit)
  sorted.forEach(visit)
  return result
}
