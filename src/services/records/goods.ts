import { request } from '../api.ts'
import { recordId } from './contracts.ts'
export function fetchDevicePage(page = 1, type = '') { return request<any>('/device/query', 'GET', { page, pageSize: 100, type }) }
export function fetchDictionary(dictType, user = false) { return request<any>((user ? '/userDictType' : '/sysDictType') + '/getByDictType', 'GET', { dictType }) }
export function saveDevice(payload) { return request('/device' + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteDevice(id) { return request('/device/' + recordId(id), 'DELETE') }
export function fetchPerformancePage(page = 1) { return request<any>('/performance', 'GET', { page, pageSize: 30 }) }
export function savePerformance(payload) { return request<any>('/performance', payload.id ? 'PUT' : 'POST', payload) }
export function deletePerformance(id) { return request('/performance/' + recordId(id), 'DELETE') }
