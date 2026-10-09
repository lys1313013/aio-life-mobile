import { menuVisuals } from './menu-visuals.ts'
import { minimalRequestPayload } from './api-payload.ts'
import { readResponse, readUser } from './contract.ts'
import { clearSession, saveToken, session } from './session.ts'
import { requestUnlock, unlockNavigationRevision } from './secondary-lock.ts'
import { invalidateMenuAccessAfterWrite, invalidateMenuAccessCache } from './menu-access-cache.ts'
import { invalidateHomeAfterWrite } from './home-refresh.ts'
import { invalidatePageAfterWrite } from './page-refresh-state.ts'

// 发布包默认连接线上后端，避免普通构建遗漏临时环境变量后指向手机自身。
let baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://aiolife.top/api' : 'http://127.0.0.1:45678/api')
// #ifdef WEB
baseURL = import.meta.env.VITE_WEB_API_BASE_URL || '/api'
// #endif
baseURL = baseURL.replace(/\/$/, '')

export function apiUrl(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path)) throw new Error('接口地址无效')
  return baseURL + path
}

export function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data: any = null, authenticated = true, tokenOverride: string | null = null, unlockAttempt = false, timeoutMs = 15000): Promise<T> {
  const token = tokenOverride != null ? tokenOverride : (authenticated ? session.token : '')
  const navigationRevision = unlockNavigationRevision()
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token.length > 0) header.Authorization = 'Bearer ' + token
    uni.request({
      url: apiUrl(path),
      method,
      data: minimalRequestPayload(path, method, data),
      header,
      timeout: timeoutMs,
      success: (response) => {
        if (authenticated && tokenOverride == null && token && token !== session.token) {
          const stale = new Error('登录状态已变化，请重试'); stale.name = 'StaleSessionError'; reject(stale); return
        }
        try {
          const result = readResponse(response.statusCode, response.data)
          if (token && token === session.token) {
            invalidateMenuAccessAfterWrite(path, method)
            menuVisuals.afterWrite(path, method)
            invalidateHomeAfterWrite(path, method)
            invalidatePageAfterWrite(path, method)
          }
          resolve(result)
        } catch (error) {
          if (error.name === 'SecondaryLockRequiredError' && token && session.token === token) invalidateMenuAccessCache()
          if (error.name === 'SecondaryLockRequiredError' && !unlockAttempt && token && session.token === token) {
            if (navigationRevision !== unlockNavigationRevision()) { reject(new Error('页面已变化，请重新操作')); return }
            // 2001 是服务端在执行操作前拒绝的请求，解锁后仅重发一次。
            requestUnlock(error.menuPath, token)
              .then(() => {
                if (session.token !== token) throw new Error('登录状态已变化，请重试')
                return request<T>(path, method, data, authenticated, token, true, timeoutMs)
              }).then(resolve, reject)
            return
          }
          if (error.name === 'SessionExpiredError' && token.length > 0 && session.token === token) {
            clearSession()
            uni.reLaunch({ url: '/pages/login/index' })
          }
          reject(error)
        }
      },
      fail: () => reject(new Error('连接失败，请检查网络后重试')),
    })
  })
}

export async function login(username, password) {
  const data = await request<{ accessToken: string }>('/auth/login', 'POST', { username: username.trim(), password }, false)
  saveToken(data == null ? '' : data.accessToken)
}

export async function fetchUser() {
  const token = session.token
  const user = readUser(await request('/user/info'))
  // 忽略退出登录后返回的旧请求，避免重新显示上一账号的信息。
  if (session.token === token && token.length > 0) session.user = user
  return user
}

export async function logout() {
  try {
    await request('/auth/logout', 'POST')
  } finally {
    clearSession()
  }
}

export function uploadAvatar(filePath: string): Promise<{ id: string; fileUrl: string }> {
  const token = session.token
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: baseURL + '/file/upload', filePath, name: 'file',
      formData: { bizType: 'avatar' }, header: { Authorization: 'Bearer ' + token },
      success: (response) => {
        try {
          const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
          const data = readResponse(response.statusCode, body)
          if (!data || typeof data.id !== 'string' || !/^[a-fA-F0-9]{32}$/.test(data.id) || typeof data.fileUrl !== 'string' || !data.fileUrl) throw new Error('头像上传结果异常，请重试')
          resolve({ id: data.id, fileUrl: data.fileUrl })
        } catch (error) {
          if (response.statusCode === 401) {
            if (session.token === token) {
              clearSession()
              uni.reLaunch({ url: '/pages/login/index' })
            }
            const expired = new Error('登录已过期，请重新登录'); expired.name = 'SessionExpiredError'; reject(expired)
          } else reject(error)
        }
      },
      fail: () => reject(new Error('头像上传失败，请重试')),
    })
  })
}
