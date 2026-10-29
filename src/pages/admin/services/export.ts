import { createOutputFile, releaseOutputFile, saveOutputFile } from './file-output.ts'
import { apiUrl } from '../../../services/api.ts'
import { session } from '../../../services/session.ts'
import { queryPath } from '../../../services/admin/contract.ts'
export function exportLogs(kind, filters) {
  if (!['operation','access'].includes(kind)) return Promise.reject(Error('日志类型无效'))
  const token = session.token
  return new Promise((resolve, reject) => {
    const path = queryPath('/system/logs/' + kind + '/export', filters)
    uni.request({ url: apiUrl(path), header: { Authorization:'Bearer ' + token }, responseType:'arraybuffer', timeout:120000,
      async success(response) {
        try {
          if (!token || session.token !== token) throw Error('登录状态已变化，请重试')
          const contentType = String(response.header?.['Content-Type'] || response.header?.['content-type'] || '')
          if (response.statusCode !== 200 || !contentType.includes('text/csv')) throw Error('导出失败，请重试')
          const filename = 'aio-life-' + kind + '-logs.csv'
          const destination = await createOutputFile(response.data as ArrayBuffer, filename, 'text/csv;charset=utf-8')
          if (!token || session.token !== token) {
            releaseOutputFile(destination)
            throw Error('登录状态已变化，请重试')
          }
          await saveOutputFile(destination, filename)
          resolve(filename)
        } catch (reason) { reject(reason) }
      }, fail:() => reject(Error('日志导出失败，请重试')),
    })
  })
}
