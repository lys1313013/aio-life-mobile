import { request } from '../../../services/api.ts'
import { queryPath } from '../../../services/query-path.ts'
import { recordId } from '../../../services/records/contracts.ts'
function base(kind) { return kind === 'movie' ? '/movie' : '/read-record' }
export function fetchLibrary(kind, filters) { return request<any>(queryPath(base(kind) + '/page', filters)) }
export function fetchLibraryDetail(kind, id) { return request<any>(base(kind) + '/' + recordId(id)) }
export function saveLibrary(kind, payload) { return request(base(kind), payload.id ? 'PUT' : 'POST', payload) }
export function deleteLibrary(kind, id) { return request(base(kind) + '/' + recordId(id), 'DELETE') }
export function parseDouban(kind, url) { return request<any>(base(kind) + '/parse-douban', 'GET', { url }) }
export function previewDoubanImport(payload) { return request<any>('/movie/import/douban/preview', 'POST', payload) }
export function importDouban(payload) { return request<any>('/movie/import/douban', 'POST', payload) }

export function fetchRankings(kind: string) {
  return request<Array<{ id: string; name: string }>>('/creative-works/rankings', 'GET', { media: kind === 'movie' ? 'movie' : 'book' })
}
