import { createOutputFile, releaseOutputFile, saveOutputFile } from './file-output.ts'
import { apiUrl, request } from '../../../services/api.ts'
import { clearSession, session } from '../../../services/session.ts'
import { queryPath } from '../../../services/query-path.ts'

export function queryStorageObjects(params) {
  return request(queryPath('/system/storage/objects', params))
}

export function deleteStorageObject(key) {
  return request('/system/storage/object?key=' + encodeURIComponent(key), 'DELETE')
}

export function storageFilePath(key, download = false) {
  if (typeof key !== 'string' || !key || key.endsWith('/')) throw Error('请选择文件')
  return '/system/storage/' + (download ? 'download' : 'preview') + '?key=' + encodeURIComponent(key)
}

export function storageFileName(key) {
  return (key.split('/').pop() || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
}

export function releaseStorageFile(path: string) {
  releaseOutputFile(path)
}

// 下载和预览都走管理员鉴权接口；不生成公开地址或将 token 放入 URL。
export function readStorageObject(key, download = false): Promise<string> {
  const token = session.token
  const path = storageFilePath(key, download)
  return new Promise((resolve, reject) => {
    uni.request({
      url: apiUrl(path), header: { Authorization: 'Bearer ' + token }, responseType: 'arraybuffer', timeout: 120000,
      async success(response) {
        try {
          if (!token || token !== session.token) throw Error('登录状态已变化，请重试')
          if (response.statusCode === 401) { clearSession(); uni.reLaunch({ url: '/pages/login/index' }); throw Error('登录已过期，请重新登录') }
          const type = String(response.header?.['Content-Type'] || response.header?.['content-type'] || '').split(';')[0]
          if (response.statusCode !== 200 || (download ? type !== 'application/octet-stream' : !/^image\/(jpeg|png|gif|webp|avif|bmp)$/.test(type))) throw Error('文件读取失败，请重试')
          const destination = await createOutputFile(response.data as ArrayBuffer, storageFileName(key), type)
          if (token !== session.token) { releaseStorageFile(destination); throw Error('登录状态已变化，请重试') }
          resolve(destination)
        } catch (reason) { reject(reason) }
      }, fail: () => reject(Error('文件读取失败，请检查网络后重试')),
    })
  })
}

export async function downloadStorageObject(key, current = () => true) {
  const path = await readStorageObject(key, true)
  if (!current()) { releaseStorageFile(path); return '' }
  const filename = storageFileName(key)
  return saveOutputFile(path, filename)
}
