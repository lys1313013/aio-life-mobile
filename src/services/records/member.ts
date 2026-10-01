import { request } from '../api.ts'
import { recordId } from './contracts.ts'
export function fetchMembers() { return request<any[]>('/membership/list') }
export function fetchMemberStats() { return request<any>('/membership/stats') }
export function saveMember(payload) { return request<any>('/membership', payload.id ? 'PUT' : 'POST', payload) }
export function deleteMember(id) { return request('/membership/' + recordId(id), 'DELETE') }
