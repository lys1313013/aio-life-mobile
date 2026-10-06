// 纯逻辑：不依赖浏览器或平台，可在 Node 中执行契约测试。
export function readResponse(statusCode, body) {
  if (statusCode === 401) {
    const error = new Error('登录已过期，请重新登录')
    error.name = 'SessionExpiredError'
    throw error
  }
  if (statusCode < 200 || statusCode >= 300) {
    if ([400, 403, 409, 429].includes(statusCode) && body != null && Number.isInteger(body.code)
      && body.code !== 0 && typeof body.message === 'string' && body.message.length > 0) {
      throw new Error(body.message)
    }
    throw new Error(statusCode >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请稍后重试')
  }
  if (body == null || typeof body !== 'object' || !Number.isInteger(body.code)) {
    throw new Error('服务返回异常，请稍后重试')
  }
  if (body.code !== 0) {
    if (body.code === 2001 && typeof body.data?.menuPath === 'string') {
      const error = new Error('需要二级密码验证')
      error.name = 'SecondaryLockRequiredError'
      error.menuPath = body.data.menuPath
      throw error
    }
    throw new Error(typeof body.message === 'string' && body.message.length > 0 ? body.message : '请求未完成，请重试')
  }
  return body.data
}

export function readWechatLogin(data) {
  if (data == null || typeof data.status !== 'string') throw new Error('微信登录结果异常，请重试')
  if (data.status === 'LOGGED_IN') {
    if (typeof data.accessToken !== 'string' || data.accessToken.length === 0
      || typeof data.id !== 'string' || data.id.length === 0
      || typeof data.hasPassword !== 'boolean' || typeof data.accountUsername !== 'string'
      || data.accountUsername.length === 0) throw new Error('微信登录结果异常，请重试')
    return data
  }
  if ((data.status === 'PHONE_REQUIRED' || data.status === 'BIND_REQUIRED')
    && typeof data.loginTicket === 'string' && data.loginTicket.length > 0
    && typeof data.expiresIn === 'number' && data.expiresIn > 0 && data.expiresIn <= 300) return data
  throw new Error('微信登录结果异常，请重试')
}

export function readUser(data) {
  if (data == null || typeof data.id !== 'string' || data.id.length === 0) {
    throw new Error('用户信息异常，请重试')
  }
  if (data.avatarFileId != null && (typeof data.avatarFileId !== 'string' || !/^[a-fA-F0-9]{32}$/.test(data.avatarFileId))) {
    throw new Error('头像信息异常，请重试')
  }
  return {
    id: data.id,
    username: typeof data.accountUsername === 'string' ? data.accountUsername : (typeof data.username === 'string' ? data.username : ''),
    name: data.nickname || data.realName || data.username || '朋友',
    nickname: typeof data.nickname === 'string' ? data.nickname : '',
    avatarFileId: typeof data.avatarFileId === 'string' ? data.avatarFileId : null,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
    email: typeof data.email === 'string' ? data.email : '',
    introduction: typeof data.introduction === 'string' ? data.introduction : '',
    roles: Array.isArray(data.roles) ? data.roles.filter(role => typeof role === 'string') : [],
  }
}

export function validateCredentials(username, password) {
  if (username.trim().length === 0) return '请输入账号'
  if (password.length === 0) return '请输入密码'
  return ''
}
