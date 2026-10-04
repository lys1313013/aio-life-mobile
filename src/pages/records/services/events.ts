import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchEvents(kind) { return request<any[]>(kind === 'anniversary' ? '/anniversaryRecords' : '/milestones') }
export function saveEvent(kind, payload) { return request<any>(kind === 'anniversary' ? '/anniversaryRecords' : '/milestones', payload.id ? 'PUT' : 'POST', payload) }
export function setAnniversaryPinned(id, isPinned) { return request<any>('/anniversaryRecords/' + recordId(id) + '/pin', 'PUT', { isPinned }) }
export function deleteEvent(kind, id) { return request((kind === 'anniversary' ? '/anniversaryRecords' : '/milestones') + '/batchDelete', 'POST', { idList: [recordId(id)] }) }
export function daysFromToday(date, today = new Date()) {
  const parts = date.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000)
}
