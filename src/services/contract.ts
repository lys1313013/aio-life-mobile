// 纯逻辑：不依赖浏览器或平台，可在 Node 中执行契约测试。
export function readResponse(statusCode, body) {
  if (statusCode === 401) {
    const error = new Error('登录已过期，请重新登录')
    error.name = 'SessionExpiredError'
    throw error
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(statusCode >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请稍后重试')
  }
  if (body == null || typeof body !== 'object' || typeof body.rscode !== 'string') {
    throw new Error('服务返回异常，请稍后重试')
  }
  if (body.rscode !== '0') {
    throw new Error(typeof body.result === 'string' && body.result.length > 0 ? body.result : '请求未完成，请重试')
  }
  return body.data
}

export function readUser(data) {
  if (data == null || typeof data.id !== 'string' || data.id.length === 0) {
    throw new Error('用户信息异常，请重试')
  }
  return {
    id: data.id,
    username: typeof data.username === 'string' ? data.username : '',
    name: data.nickname || data.realName || data.username || '朋友',
    email: typeof data.email === 'string' ? data.email : '',
    introduction: typeof data.introduction === 'string' ? data.introduction : '',
  }
}

export function validateCredentials(username, password) {
  if (username.trim().length === 0) return '请输入账号'
  if (password.length === 0) return '请输入密码'
  return ''
}
