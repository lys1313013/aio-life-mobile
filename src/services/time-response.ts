/** 单日时迹接口返回完整记录数组。 */
export function readDateRecords(data) {
  if (!Array.isArray(data)) throw new Error('时迹数据格式异常，请重试')
  return data
}
