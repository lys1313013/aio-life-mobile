import { request } from '../../../services/api.ts'

const path = '/system/bank-card-covers'
function id(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw Error('银行卡面 ID 异常，请重新加载')
  return value
}
function fileId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{32}$/i.test(value)) throw Error('请上传有效的卡面图片')
  return value
}
export function readCover(row) {
  if (!row || typeof row.name !== 'string' || !['debit', 'credit'].includes(row.cardType)
    || ![0, 1].includes(row.isEnabled) || !Number.isInteger(row.sortOrder) || row.sortOrder < 0) throw Error('卡面数据异常，请重试')
  const usageCount = typeof row.usageCount === 'string' && /^\d+$/.test(row.usageCount) ? Number(row.usageCount) : row.usageCount
  if (!Number.isSafeInteger(usageCount) || usageCount < 0) throw Error('卡面使用数量异常，请重试')
  return { ...row, id: id(row.id), bankId: id(row.bankId), fileId: fileId(row.fileId), usageCount }
}
export async function listCoverTemplates() {
  const rows = await request(path)
  if (!Array.isArray(rows)) throw Error('卡面列表异常，请重试')
  return rows.map(readCover)
}
export async function listCoverBanks() {
  const rows = await request(path + '/banks')
  if (!Array.isArray(rows)) throw Error('银行列表异常，请重试')
  return rows.map(row => {
    if (!row || typeof row.name !== 'string' || typeof row.enabled !== 'boolean') throw Error('银行数据异常，请重试')
    return { ...row, id: id(row.id) }
  })
}
export function coverPayload(form, original = null) {
  const name = String(form.name || '').trim(), sourceUrl = String(form.sourceUrl || '').trim()
  if (!name || name.length > 100) throw Error('请输入不超过100字的卡面名称')
  if (!form.bankId) throw Error('请选择银行')
  const bankId = id(form.bankId), cardType = form.cardType
  if (!['debit', 'credit'].includes(cardType)) throw Error('请选择银行卡类型')
  if (original?.usageCount > 0 && (original.bankId !== bankId || original.cardType !== cardType)) throw Error('卡面已被使用，不能修改银行或类型')
  if (sourceUrl && (sourceUrl.length > 1000 || !/^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(sourceUrl))) throw Error('图片出处须为完整网页地址')
  const sortOrder = typeof form.sortOrder === 'string' && /^\d+$/.test(form.sortOrder.trim()) ? Number(form.sortOrder) : form.sortOrder
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483647) throw Error('排序须为0至2147483647的整数')
  if (![0, 1].includes(form.isEnabled)) throw Error('卡面状态无效')
  return { name, bankId, cardType, sourceUrl: sourceUrl || null, fileId: fileId(form.fileId), isEnabled: form.isEnabled, sortOrder }
}
export async function saveCoverTemplate(form, original = null) {
  return readCover(await request(path + (original ? '/' + id(original.id) : ''), original ? 'PUT' : 'POST', coverPayload(form, original)))
}
export async function setCoverEnabled(row) {
  return readCover(await request(path + '/' + id(row.id) + '/enabled', 'PUT', { isEnabled: row.isEnabled === 1 ? 0 : 1 }))
}
export function deleteCoverTemplate(row) {
  if (row.usageCount > 0) throw Error('卡面已被使用，请停用而非删除')
  return request(path + '/' + id(row.id), 'DELETE')
}

// 查询期间发生的保存、启停与删除必须覆盖旧查询结果。
export function createCoverMutations() {
  let version = 0
  const changes = new Map()
  return {
    version: () => version,
    record(key, item = null) { changes.set(key, { version: ++version, item }) },
    merge(rows, since) {
      const result = new Map(rows.map(row => [row.id, row]))
      for (const [key, change] of changes) {
        if (change.version <= since) continue
        if (change.item) result.set(key, change.item)
        else result.delete(key)
      }
      return [...result.values()]
    },
    clear() { version = 0; changes.clear() },
  }
}

export function coverPlacement(width, height, mode, zoom = 1) {
  if (!(width > 0 && height > 0) || width * height > 16_000_000) throw Error('图片不能超过1600万像素')
  const scale = mode === 'cover' ? Math.max(960 / width, 605 / height) * Math.min(3, Math.max(1, zoom)) : Math.min(960 / width, 605 / height)
  return { x: (960 - width * scale) / 2, y: (605 - height * scale) / 2, width: width * scale, height: height * scale }
}
