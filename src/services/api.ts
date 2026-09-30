import { readResponse, readUser } from './contract.ts'
import { clearSession, saveToken, session } from './session.ts'

let baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:45678/api'
// #ifdef WEB
baseURL = import.meta.env.VITE_WEB_API_BASE_URL || '/api'
// #endif
baseURL = baseURL.replace(/\/$/, '')

export function request<T>(path: string, method: 'GET' | 'POST' = 'GET', data: Record<string, string> | null = null, authenticated = true): Promise<T> {
  const token = authenticated ? session.token : ''
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token.length > 0) header.Authorization = 'Bearer ' + token
    uni.request({
      url: baseURL + path,
      method,
      data,
      header,
      timeout: 15000,
      success: (response) => {
        try {
          resolve(readResponse(response.statusCode, response.data))
        } catch (error) {
          if (error.name === 'SessionExpiredError' && token.length > 0 && session.token === token) {
            clearSession()
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
