import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchDevicePage(page = 1, type = '') { return request<any>('/device/query', 'GET', { page, pageSize: 100, type }) }
export function saveDevice(payload) { return request('/device' + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteDevice(id) { return request('/device/' + recordId(id), 'DELETE') }
