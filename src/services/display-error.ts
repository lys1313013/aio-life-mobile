// 页面保留业务错误的可操作说明；服务端实现异常不直接铺成技术堆栈。
export function displayError(message: string): string {
  const value = message.trim()
  const serverFailure = /\b(?:NoClassDefFoundError|ClassNotFoundException|BeanCreationException|SQLSyntaxErrorException|SQLException|NullPointerException)\b|\b(?:java\.lang|org\.springframework|org\.mybatis|com\.mysql)\.|\bSQLSTATE\b|\bCaused by:\s|\bat\s+[\w.$]+\([^\n]*\.java:\d+\)/i
  return serverFailure.test(value) ? '服务暂时不可用，请稍后重试' : value
}
