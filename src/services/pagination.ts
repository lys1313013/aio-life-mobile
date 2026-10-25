// PageResp.total 未提供时保持未知；兼容旧服务端的十进制字符串计数。
export function readPageTotal(value: unknown): number | null {
  if (value == null) return null
  const total = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw new Error('分页总数异常，请重试')
  return total
}

export function hasMorePageItems(count: number, total: number | null, ended = false): boolean {
  return !ended && (total == null || count < total)
}

// 保持首次出现顺序，后页重复项更新已有字段，不丢掉前页独有的附属字段。
export function mergePageItems<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const result: T[] = []
  const positions = new Map<string, number>()
  for (const item of [...previous, ...incoming]) {
    if (typeof item?.id !== 'string' || !item.id) throw new Error('列表记录 ID 异常，请重试')
    const index = positions.get(item.id)
    if (index == null) {
      positions.set(item.id, result.length)
      result.push(item)
    } else result[index] = { ...result[index], ...item }
  }
  return result
}
