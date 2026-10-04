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
export function scanWithCamera(): Promise<string> {
  // #ifdef WEB
  return Promise.reject(new Error('请在 AIO Life App 或微信小程序中使用扫一扫'))
  // #endif
  // #ifndef WEB
  return new Promise((resolve, reject) => {
    uni.scanCode({
      onlyFromCamera: true, scanType: ['qrCode'],
      success: result => resolve(result.result),
      fail: reason => {
        const cancelled = typeof reason.errMsg === 'string' && /cancel/i.test(reason.errMsg)
        const error = new Error(cancelled ? '已取消扫码' : '无法使用摄像头，请检查相机权限后重试')
        error.name = cancelled ? 'ScanCancelledError' : 'ScanCameraError'
        reject(error)
      },
    })
  })
  // #endif
}
