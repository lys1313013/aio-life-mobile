import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchHonors() { return request<any[]>('/honorRecords') }
export function fetchHonorCategories() { return request<any[]>('/honorCategories') }
export function saveHonor(payload) { return request<any>('/honorRecords', payload.id ? 'PUT' : 'POST', payload) }
export function deleteHonor(id) { return request('/honorRecords/batchDelete', 'POST', { idList: [recordId(id)] }) }
export function toggleHonorTop(id) { return request('/honorRecords/toggleTop/' + recordId(id), 'POST') }
