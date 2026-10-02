import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchGoals(filters = {}) { return request<any[]>('/goals', 'GET', filters) }
export function saveGoal(payload) { return request<any>('/goals', payload.id ? 'PUT' : 'POST', payload) }
export function deleteGoal(id) { return request('/goals/batchDelete', 'POST', { idList: [recordId(id)] }) }
export function fetchColumns() { return request<any>('/taskColumn/query', 'GET', { page: 1, pageSize: 1000 }) }
export function fetchTasks(page = 1) { return request<any>('/tasks', 'GET', { get: page, pageSize: 100 }) }
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
