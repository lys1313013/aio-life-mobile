import { reactive } from 'vue'

const tokenKey = 'aio-life-mobile.access-token.v1'
export const session = reactive({ token: '', user: null, initialized: false })

export function restoreSession() {
  if (session.initialized) return
  try {
    const token = uni.getStorageSync(tokenKey)
    session.token = typeof token === 'string' ? token : ''
  } catch (_) {
    session.token = ''
  }
  session.initialized = true
}

export function saveToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('登录结果异常，请重试')
  }
  try {
    uni.setStorageSync(tokenKey, token)
  } catch (_) {
    throw new Error('无法保存登录状态，请检查设备存储后重试')
  }
  session.token = token
  session.user = null
  session.initialized = true
}

export function clearSession() {
  session.token = ''
  session.user = null
  session.initialized = true
  try {
    uni.removeStorageSync(tokenKey)
  } catch (_) {
    // 部分平台删除失败时尝试覆盖，避免下次启动恢复旧登录。
    try { uni.setStorageSync(tokenKey, '') } catch (_) { /* 内存登录态仍已清理 */ }
  }
}
