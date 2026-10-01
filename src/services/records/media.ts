import { request } from '../api.ts'
import { recordId } from './contracts.ts'
function base(kind) { return kind === 'movie' ? '/movie' : '/read-record' }
export function fetchLibrary(kind, filters) { return request<any>(base(kind) + '/page', 'GET', filters) }
export function fetchLibraryDetail(kind, id) { return request<any>(base(kind) + '/' + recordId(id)) }
export function saveLibrary(kind, payload) { return request(base(kind), payload.id ? 'PUT' : 'POST', payload) }
export function deleteLibrary(kind, id) { return request(base(kind) + '/' + recordId(id), 'DELETE') }
export function parseDouban(kind, url) { return request<any>(base(kind) + '/parse-douban', 'GET', { url }) }
export function previewDoubanImport(payload) { return request<any>('/movie/import/douban/preview', 'POST', payload) }
export function importDouban(payload) { return request<any>('/movie/import/douban', 'POST', payload) }
