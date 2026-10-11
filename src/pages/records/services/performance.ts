import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchPerformancePage(page = 1) { return request<any>('/performance', 'GET', { page, pageSize: 30 }) }
export function savePerformance(payload) { return request<any>('/performance', payload.id ? 'PUT' : 'POST', payload) }
export function deletePerformance(id) { return request('/performance/' + recordId(id), 'DELETE') }
