import { session } from '../../../services/session.ts'
import { request } from '../../../services/api.ts'
import { goalDisplayStatus, refreshGoalRows } from '../../../services/goal-progress.ts'
import { recordId } from '../../../services/records/contracts.ts'
export async function fetchGoals(filters = {}) { const token = session.token; const { status, ...query } = filters; const rows = await refreshGoalRows(await request<any[]>('/goals', 'GET', query), request, () => session.token === token); return status ? rows.filter(row => goalDisplayStatus(row) === status) : rows }
export function saveGoal(payload) { return request<any>('/goals', payload.id ? 'PUT' : 'POST', payload) }
export function setGoalPinned(id, isPinned) { return request<any>('/goals/' + recordId(id) + '/pin', 'PUT', { isPinned }) }
export function deleteGoal(id) { return request('/goals/batchDelete', 'POST', { idList: [recordId(id)] }) }
export function fetchColumns(page = 1) { return request<any>('/taskColumn/query', 'GET', { page, pageSize: 200 }) }
export function fetchTasks(page = 1) { return request<any>('/tasks', 'GET', { page, pageSize: 100 }) }
export function fetchDetails(taskId) { return request<any[]>('/taskDetails', 'GET', { taskId: recordId(taskId) }) }
export function saveTaskRecord(kind, payload) {
  const base = kind === 'column' ? '/taskColumn' : kind === 'task' ? '/tasks' : '/taskDetails'
  return request<any>(base + (payload.id && kind !== 'detail' ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload)
}
export function deleteTaskRecord(kind, id) {
  return request((kind === 'column' ? '/taskColumn/' : kind === 'task' ? '/tasks/' : '/taskDetails/') + recordId(id), 'DELETE')
}
export function sortTaskRecords(kind, payload) { return request((kind === 'column' ? '/taskColumn' : kind === 'task' ? '/tasks' : '/taskDetails') + '/reSort', 'POST', payload) }
export function starDetail(id, starred) { return request('/taskDetails/' + (starred ? 'star/' : 'unstar/') + recordId(id), 'POST') }

export function fetchWatchedDetails() { return request<any[]>('/taskDetails/watched') }
