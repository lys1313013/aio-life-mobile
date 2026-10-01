import { chooseDocument, releaseDocument } from './native-files.ts'
import { apiUrl } from './api.ts'
import { requestUnlock, unlockNavigationRevision } from './secondary-lock.ts'
import { readResponse } from './contract.ts'
import { clearSession, session } from './session.ts'

function current(token: string) {
  if (!token || token !== session.token) throw new Error('登录状态已变化，请重试')
}

export function uploadAttachment(path: string, filePath: string, formData: Record<string, string> = {}, unlockAttempt = false): Promise<any> {
  const token = session.token
  const navigationRevision = unlockNavigationRevision()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: apiUrl(path), filePath, name: 'file', formData,
      header: { Authorization: 'Bearer ' + token },
      success(response) {
        try {
          current(token)
          const result = readResponse(response.statusCode, typeof response.data === 'string' ? JSON.parse(response.data) : response.data)
          if (!result || typeof result.id !== 'string') throw new Error('附件上传结果异常')
          resolve(result)
        } catch (reason) {
          if (reason.name === 'SecondaryLockRequiredError' && !unlockAttempt && token === session.token) {
            if (navigationRevision !== unlockNavigationRevision()) { reject(new Error('页面已变化，请重新操作')); return }
            requestUnlock(reason.menuPath, token).then(()=>{current(token);return uploadAttachment(path,filePath,formData,true)}).then(resolve,reject);return
          }
          if (reason.name === 'SessionExpiredError' && token === session.token) { clearSession(); uni.reLaunch({url:'/pages/login/index'}) }
          reject(reason)
        }
      },
      fail: () => reject(new Error('附件上传失败，请重试')),
    })
  })
}

export function chooseAndUploadAttachment(path: string, formData: Record<string, string> = {}): Promise<any> {
  const token=session.token
  return new Promise((resolve, reject) => {
    uni.chooseImage({ count: 1, success: result => {
      const filePath = result.tempFilePaths[0]
      try {current(token)} catch(error) {reject(error);return}
      uploadAttachment(path, filePath, formData).then(resolve, reject)
    }, fail: () => reject(new Error('未选择图片')) })
  })
}

export async function chooseAndUploadDocument(path: string, formData: Record<string,string> = {}): Promise<any> {
  const token=session.token
  const file=await chooseDocument()
  try{current(token);return await uploadAttachment(path,file.path,formData)}finally{await releaseDocument(file)}
}

// 鉴权通过 header 传递，不拼入 URL、不持久化跨用户缓存。
export function authFileUrl(id: string): Promise<string> {
  if (typeof id !== 'string' || !id) return Promise.reject(new Error('附件 ID 无效'))
  const token = session.token
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: apiUrl('/file/preview/' + encodeURIComponent(id)),
      header: { Authorization: 'Bearer ' + token },
      success(response) {
        try {
          current(token)
          if (response.statusCode === 401) { clearSession(); uni.reLaunch({url:'/pages/login/index'}); throw new Error('登录已过期，请重新登录') }
          if (response.statusCode !== 200) throw new Error('附件加载失败，请重试')
          resolve(response.tempFilePath)
        } catch (reason) { reject(reason) }
      },
      fail: () => reject(new Error('附件加载失败，请重试')),
    })
  })
}
