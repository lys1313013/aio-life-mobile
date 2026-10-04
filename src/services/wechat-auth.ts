import { request } from './api.ts'
import { readWechatLogin } from './contract.ts'
import { saveToken } from './session.ts'

// 平台差异仅在获取微信凭证处隔离，App / Web 不复用小程序凭证。
export function getWechatCode() {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: 'weixin',
      success: (result) => {
        if (typeof result.code === 'string' && result.code.length > 0) resolve(result.code)
        else reject(new Error('未获取到微信凭证，请重试'))
      },
      fail: () => reject(new Error('微信登录未完成，请重试')),
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('请在微信小程序中使用微信登录'))
    // #endif
  })
}

export async function fetchWechatCapabilities() {
  const data = await request('/auth/wechat/mini/capabilities', 'GET', null, false)
  return {
    enabled: data != null && data.enabled === true,
    registrationEnabled: data != null && data.enabled === true && data.registrationEnabled === true,
  }
}

function acceptLogin(data) {
  const result = readWechatLogin(data)
  // 临时票据绝不能保存成业务 Token。
  if (result.status === 'LOGGED_IN') saveToken(result.accessToken)
  return result
}

export async function startWechatLogin() {
  const loginCode = await getWechatCode()
  return acceptLogin(await request('/auth/wechat/mini/login', 'POST', { loginCode }, false))
}

export async function registerWithWechat(loginTicket) {
  return acceptLogin(await request('/auth/wechat/mini/register', 'POST', { loginTicket }, false))
}

export async function bindWechatAccount(loginTicket, username, password) {
  const login = await request('/auth/login', 'POST', { username: username.trim(), password }, false)
  if (login == null || typeof login.accessToken !== 'string' || login.accessToken.length === 0) {
    throw new Error('原账号登录结果异常，请重试')
  }
  // 验证原账号的临时会话不落盘，绑定完成后才保存最终业务会话。
  try {
    return acceptLogin(await request('/auth/wechat/mini/bind', 'POST', { loginTicket, password }, true, login.accessToken))
  } finally {
    try { await request('/auth/logout', 'POST', null, true, login.accessToken) } catch (_) { /* 不覆盖绑定结果 */ }
  }
}

export async function initializeWechatPassword(newPassword) {
  const loginCode = await getWechatCode()
  await request('/auth/wechat/mini/password', 'POST', { loginCode, newPassword })
}
