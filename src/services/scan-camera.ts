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

// 扫码结果只在内存中单次交接，不写入路由或本地存储。
let pending: { content: string; token: string; expiresAt: number } | null = null
export function rememberScanResult(content: string, token: string) {
  pending = { content, token, expiresAt: Date.now() + 30_000 }
}
export function clearScanResult() { pending = null }
export function takeScanResult(token: string): string | null {
  const value = pending
  pending = null
  return value && value.token === token && value.expiresAt > Date.now() ? value.content : null
}
