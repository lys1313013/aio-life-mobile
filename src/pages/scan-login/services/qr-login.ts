import { request } from '../../../services/api.ts'

// 只识别本业务协议；不打开扫码得到的 URL，不向二维码指定的域名发送 Token。
export function parseLoginQr(content: string): { id: string; ticket: string } {
  const match = /^aiolife:\/\/web-login\?v=1&id=([a-f0-9]{64})&ticket=([a-f0-9]{64})$/.exec(content)
  if (!match || match[0] !== content) throw new Error('请扫描 AIO Life 网页上的 App 登录二维码')
  return { id: match[1], ticket: match[2] }
}
export interface LoginQrInfo {
  status: string
  browser: string
  requestedAt: string
  verificationCode: string
  expiresIn: number
}
export function readLoginQrInfo(data: any): LoginQrInfo {
  if (!data || !['SCANNED', 'CONFIRMED', 'REJECTED', 'ISSUING', 'CONSUMED', 'FAILED'].includes(data.status)
    || typeof data.browser !== 'string' || typeof data.requestedAt !== 'string'
    || typeof data.verificationCode !== 'string' || !/^\d{4}$/.test(data.verificationCode)
    || typeof data.expiresIn !== 'number' || data.expiresIn < 0 || data.expiresIn > 120) {
    throw new Error('扫码结果异常，请重新扫码')
  }
  return data
}
export async function scanLoginQr(value: { id: string; ticket: string }) {
  return readLoginQrInfo(await request('/auth/qr-login/scan', 'POST', { id: value.id, ticket: value.ticket }))
}
export async function decideLoginQr(value: { id: string; ticket: string }, approve: boolean) {
  return request('/auth/qr-login/decision', 'POST', { id: value.id, ticket: value.ticket, approve })
}
