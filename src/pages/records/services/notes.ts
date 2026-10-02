import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchNotes(kind, page = 1, keyword = '') { return request<any>((kind === 'think' ? '/thought' : '/memo') + '/query', 'GET', { page, pageSize: 30, content: keyword }) }
export function saveNote(kind, payload) { const base = kind === 'think' ? '/thought' : '/memo'; return request(base + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteNote(kind, id) { return kind === 'think' ? request('/thought/batchDelete', 'POST', { idList: [recordId(id)] }) : request('/memo/' + recordId(id), 'DELETE') }

export function fetchNoteById(id) { return request<any>('/thought/query', 'GET', { page: 1, pageSize: 1, id: recordId(id) }) }
