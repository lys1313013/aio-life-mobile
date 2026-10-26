import { missingRequired } from '../form-required.ts';
import { request } from '../api.ts'
export function ledgerId(row: Record<string, any>): string { return typeof row.id === 'string' ? row.id : '' }
export function ledgerPayload(kind: string, draft: Record<string, any>) {
  const data = { ...draft, amt: Number(draft.amt) }
  if (!Number.isFinite(data.amt) || missingRequired(kind, draft, 'amt')) throw new Error('请输入有效金额')
  if (kind === 'income') {
    if (missingRequired(kind, draft, 'incDate')) throw new Error('请选择收入日期')
  } else {
    data.transactionAmt = Number(draft.transactionAmt)
    if (!Number.isFinite(data.transactionAmt) || missingRequired(kind, draft, 'transactionAmt')) throw new Error('请输入交易金额')
    if (missingRequired(kind, draft, 'expTypeId') || missingRequired(kind, draft, 'payTypeId') || missingRequired(kind, draft, 'expTime')) throw new Error('请选择支出类型、支付方式和日期')
  }
  return data
}
export const fetchDictionary = (dictType: string) => request<{dictDetailList: any[]}>('/userDictType/getByDictType', 'GET', {dictType})
export const saveLedger = async (kind: string, draft: Record<string, any>) => {
  const data = ledgerPayload(kind, draft), id = ledgerId(draft)
  const result=await request('/' + kind + (kind === 'income' && id ? '/' + encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', data)
  if(result===false)throw new Error('记录未保存，请重试')
  return result
}
export const deleteLedger = async (kind: string, id: string) => {const result=await request('/' + kind + '/' + encodeURIComponent(id), 'DELETE');if(result===false)throw new Error('记录未删除，请重试');return result}
