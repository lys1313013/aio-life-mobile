import { request } from './api.ts'
import { getWechatCode } from './wechat-auth.ts'

// 只保存本次扫码场景，不接受任意跳转地址，也不持久化浏览器凭证。
let pendingScene = ''
let pendingAt = 0
export function rememberWebLoginScene(value) {
  let scene = ''
  try { scene = decodeURIComponent(typeof value === 'string' ? value : '') } catch (_) {}
  pendingScene = /^[a-f0-9]{32}$/.test(scene) ? scene : ''
  pendingAt = Date.now()
  return pendingScene
}
export function clearWebLoginScene() { pendingScene = ''; pendingAt = 0 }
export function webLoginReturnPath() {
  if (!pendingScene || Date.now() - pendingAt >= 300000) { clearWebLoginScene(); return '' }
  return '/pages/auth/web-login?scene=' + pendingScene
}
export async function scanWebLogin(scene) {
  return request('/auth/wechat/web/scan', 'POST', { scene })
}
export async function confirmWebLogin(scene) {
  const loginCode = await getWechatCode()
  return request('/auth/wechat/web/confirm', 'POST', { scene, loginCode })
}
export async function cancelWebLogin(scene) {
  return request('/auth/wechat/web/cancel', 'POST', { scene })
}
