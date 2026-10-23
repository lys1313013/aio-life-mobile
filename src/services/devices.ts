import { request } from './api.ts'
import { recordId } from './records/contracts.ts'
export function fetchDevicePage(page = 1, type = '') { return request<any>('/device/query', 'GET', { page, pageSize: 100, type }) }
export function saveDevice(payload) { return request('/device' + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteDevice(id) { return request('/device/' + recordId(id), 'DELETE') }
export function getDevice(id: string) { return request<any>('/device/' + recordId(id)) }
// 首页和设备列表共用的轻量编辑依赖，避免引入仅供分包使用的通用服务。
export function fetchDeviceEditorOptions() {
  return Promise.all([
    request<any>('/userDictType/getByDictType', 'GET', { dictType: 'device_type' }),
    request<any>('/sysDictType/getByDictType', 'GET', { dictType: 'device_status' }),
  ])
}
