import { apiUrl } from '../../../services/api.ts'
import { session } from '../../../services/session.ts'
import { queryPath } from '../../../services/admin/contract.ts'
export function exportLogs(kind, filters) {
  if (!['operation','access'].includes(kind)) return Promise.reject(Error('日志类型无效'))
  const token = session.token
  return new Promise((resolve, reject) => {
    const path = queryPath('/system/logs/' + kind + '/export', filters)
    uni.request({ url: apiUrl(path), header: { Authorization:'Bearer ' + token }, responseType:'arraybuffer', timeout:120000,
      success(response) {
        try {
          if (session.token !== token) throw Error('登录状态已变化，请重试')
          const contentType = String(response.header?.['Content-Type'] || response.header?.['content-type'] || '')
          if (response.statusCode !== 200 || !contentType.includes('text/csv')) throw Error('导出失败，请重试')
          const filename = 'aio-life-' + kind + '-logs.csv'
          // #ifdef WEB
          const url = URL.createObjectURL(new Blob([response.data], { type:'text/csv;charset=utf-8' }))
          const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          resolve(filename)
          // #endif
          // #ifdef MP-WEIXIN
          const destination = uni.env.USER_DATA_PATH + '/' + filename
          uni.getFileSystemManager().writeFile({ filePath:destination, data:response.data, success:() => { uni.shareFileMessage({ filePath:destination, fileName:filename, success:() => resolve(filename), fail:() => reject(Error('未完成文件分享')) }) }, fail:() => reject(Error('文件保存失败')) })
          // #endif
          // #ifdef APP
          uni.downloadFile({ url:apiUrl(path), header:{ Authorization:'Bearer ' + token }, success(result) {
            if (session.token !== token || result.statusCode !== 200) { reject(Error('导出失败，请重试')); return }
            uni.saveFile({ tempFilePath:result.tempFilePath, success:saved => resolve(saved.savedFilePath), fail:() => reject(Error('文件保存失败')) })
          }, fail:() => reject(Error('文件下载失败')) })
          // #endif
        } catch (reason) { reject(reason) }
      }, fail:() => reject(Error('日志导出失败，请重试')),
    })
  })
}
