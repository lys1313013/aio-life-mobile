import { request } from '../../../services/api.ts'

// 财务分包自己的轻量接口，避免同步导入 goods 分包。
export function getExpenseDevice(id: string) { return request<any>('/expense/' + id + '/device') }
export function searchDevices(page: number, name: string) {
  return request<any>('/device/query', 'GET', { page, pageSize: 30, name })
}
export function bindExpenseDevice(id: string, deviceId: string) {
  return request<any>('/expense/' + id + '/device', 'PUT', { deviceId })
}
export function createExpenseDevice(id: string, draft: any) {
  return request<any>('/expense/' + id + '/device', 'POST', draft)
}
export function unbindExpenseDevice(id: string) { return request<boolean>('/expense/' + id + '/device', 'DELETE') }
