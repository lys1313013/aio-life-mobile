const storageKey = 'aio-life-mobile.remembered-login.v1'

// 登录成功后默认记住账号；密码仅在用户主动勾选时保存，与登录会话独立。
export function readRememberedLogin() {
  try {
    const saved = uni.getStorageSync(storageKey)
    if (saved && typeof saved.username === 'string' && saved.username.trim().length > 0) {
      return { username: saved.username, password: typeof saved.password === 'string' ? saved.password : '' }
    }
  } catch (_) { /* 存储不可读时仍可手动登录 */ }
  return null
}

export function saveRememberedLogin(username: string, password: string) {
  try {
    uni.setStorageSync(storageKey, password.length > 0
      ? { username: username.trim(), password }
      : { username: username.trim() })
  } catch (_) {
    throw new Error('无法保存登录信息，请检查设备存储后重试')
  }
}

export function clearRememberedPassword() {
  try {
    const saved = uni.getStorageSync(storageKey)
    if (saved && typeof saved.username === 'string' && saved.username.trim().length > 0) {
      uni.setStorageSync(storageKey, { username: saved.username })
    } else uni.removeStorageSync(storageKey)
  } catch (_) {
    throw new Error('无法清除已记住的密码，请重试')
  }
}
