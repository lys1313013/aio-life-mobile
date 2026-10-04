/** 兼容新单日列表和线上旧版分页信封，不把部分记录误当完整一天。 */
export function readDateRecords(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) {
    const total = Number(data.total)
    if (!Number.isSafeInteger(total) || total < 0 || total !== data.items.length) {
      throw new Error('当天记录未完整返回，请更新服务端后重试')
    }
    return data.items
  }
  throw new Error('时迹数据格式异常，请重试')
}
