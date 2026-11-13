import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchEventRecordPage(page = 1) { return request<any>('/event-records', 'GET', { page, pageSize: 30 }) }
export function saveEventRecord(payload) { return request<any>('/event-records', payload.id ? 'PUT' : 'POST', payload) }
export function deleteEventRecord(id) { return request('/event-records/' + recordId(id), 'DELETE') }
