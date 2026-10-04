import { missingRequired } from '../form-required.ts';
// 纯业务契约，可直接用于模拟测试；所有 ID 保留服务端字符串。
export const goalTypes = ['日', '周', '月', '季度', '半年', '年度', '三年', '五年', '十年', '终生']
export const statuses = ['not_started', 'in_progress', 'completed', 'on_hold']
export const statusLabels = ['待开始', '进行中', '已完成', '搁置']
export function recordId(value) {
  if (typeof value !== 'string' || !value) throw new Error('记录 ID 异常，请重新加载')
  return value
}
export function textTags(value) {
  if (!value) return ''
  try { const tags = JSON.parse(value); return Array.isArray(tags) ? tags.join('，') : value } catch (_) { return value }
}
export function dateTime(date, time = '00:00') { return date ? date.slice(0, 10) + ' ' + time.slice(0, 5) + ':00' : null }
export function goalPayload(form) {
  if (missingRequired('goal', form, 'title')) throw new Error('请输入目标标题')
  if (!Number.isInteger(Number(form.type)) || form.type < 1 || form.type > 10) throw new Error('请选择目标类型')
  if (!statuses.includes(form.status)) throw new Error('请选择目标状态')
  const payload = { ...form, title: form.title.trim(), type: Number(form.type), tags: JSON.stringify(textTags(form.tags).split(/[,，]/).map(t => t.trim()).filter(Boolean)) }
  if (form.id) payload.id = recordId(form.id)
  for (const key of ['targetValue', 'currentValue']) {
    if (form[key] === '' || form[key] == null) payload[key] = null
    else { const value = Number(form[key]); if (!Number.isInteger(value) || value < 0) throw new Error('目标值和当前值必须为非负整数'); payload[key] = value }
  }
  if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) throw new Error('结束时间不能早于开始时间')
  return payload
}
export function taskPayload(form, kind) {
  const field = kind === 'column' ? 'title' : 'content'
  if (missingRequired(kind, form, field)) throw new Error(kind === 'column' ? '请输入列名称' : '请输入任务内容')
  const payload = { ...form, [field]: form[field].trim() }
  if (form.id) payload.id = recordId(form.id)
  if (form.columnId) payload.columnId = recordId(form.columnId)
  if (form.taskId) payload.taskId = recordId(form.taskId)
  if (kind === 'detail' && ![1, 10, 20].includes(Number(form.priority))) throw new Error('请选择优先级')
  if (payload.startTime && payload.endTime && payload.endTime < payload.startTime) throw new Error('结束时间不能早于开始时间')
  return payload
}
export function reordered(items, id, offset, kind) {
  const copy = items.slice(); const index = copy.findIndex(item => item.id === id); const next = index + offset
  if (index < 0 || next < 0 || next >= copy.length) return null
  const item = copy.splice(index, 1)[0]; copy.splice(next, 0, item)
  return { items: copy, payload: copy.map((row, position) => kind === 'detail' ? { id: recordId(row.id), sort: position + 1 } : kind === 'task' ? { id: recordId(row.id), columnId: recordId(row.columnId), sortOrder: position + 1 } : { id: recordId(row.id), sortOrder: position + 1 }) }
}
export function goalDateRange(type, now = new Date()) {
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate()), end = new Date(start)
  if (type === 2) { start.setDate(start.getDate() - start.getDay()); end = new Date(start); end.setDate(end.getDate() + 6) }
  else if (type === 3) { start.setDate(1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0) }
  else if (type === 4) { start = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1); end = new Date(start.getFullYear(), start.getMonth() + 3, 0) }
  else if (type === 5) { start = new Date(start.getFullYear(), start.getMonth() < 6 ? 0 : 6, 1); end = new Date(start.getFullYear(), start.getMonth() + 6, 0) }
  else if (type === 6) { start = new Date(start.getFullYear(), 0, 1); end = new Date(start.getFullYear(), 11, 31) }
  else if ([7, 8, 9].includes(type)) end.setFullYear(end.getFullYear() + ({ 7: 3, 8: 5, 9: 10 })[type])
  else if (type === 10) return { startDate: null, endDate: null }
  const format = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
  return { startDate: format(start) + ' 00:00:00', endDate: format(end) + ' 23:59:59' }
}
export function memberPayload(form) {
  if (missingRequired('member', form)) throw new Error('请输入会员名称和到期日期')
  if (form.startDate && form.expiryDate < form.startDate) throw new Error('到期日期不能早于开通日期')
  const payload = { ...form, name: form.name.trim(), autoRenew: Number(form.autoRenew || 0) }
  if (Object.prototype.hasOwnProperty.call(form, 'providerId')) payload.providerId = form.providerId ? recordId(form.providerId) : null
  if (form.id) payload.id = recordId(form.id)
  for (const key of ['price', 'monthlyAmount']) { if (form[key] === '' || form[key] == null) payload[key] = null; else { const number = Number(form[key]); if (!Number.isFinite(number) || number < 0) throw new Error('金额必须为非负数字'); payload[key] = number } }
  return payload
}
export function addMonthsClamped(date, months) {
  const parts = date.slice(0, 10).split('-').map(Number); const target = new Date(parts[0], parts[1] - 1 + months, 1); target.setDate(Math.min(parts[2], new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())); return target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(target.getDate()).padStart(2, '0')
}
