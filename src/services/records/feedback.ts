import { request } from '../api.ts'
import { recordId } from './contracts.ts'
export function fetchFeedbacks(page = 1, status = '') { return request<any>('/feedback/my', 'GET', { page, pageSize: 30, ...(status ? { status } : {}) }) }
export function fetchFeedback(id) { return request<any>('/feedback/my/' + recordId(id)) }
export function createFeedback(payload) { return request<any>('/feedback', 'POST', payload) }
export function commentFeedback(id, payload) { return request<any>('/feedback/' + recordId(id) + '/comment', 'POST', payload) }
export function cancelFeedback(id) { return request('/feedback/' + recordId(id), 'DELETE') }
