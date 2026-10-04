import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchMembers() { return request<any[]>('/membership/list') }
export function fetchMemberStats() { return request<any>('/membership/stats') }
export function saveMember(payload) { return request<any>('/membership', payload.id ? 'PUT' : 'POST', payload) }
export function deleteMember(id) { return request('/membership/' + recordId(id), 'DELETE') }

import { readMemberProviders } from '../../../services/membership-provider.ts'
export async function fetchMemberProviders() { return readMemberProviders(await request('/membership/providers')) }
