import { missingRequired } from '../../../services/form-required.ts';
import { request } from '../../../services/api.ts'
export function ledgerId(row: Record<string, any>): string { return typeof row.id === 'string' ? row.id : '' }
export function ledgerPayload(kind: string, draft: Record<string, any>) {
  const amountKey = kind === 'income' ? 'grossAmount' : 'bookkeepingAmount'
  const data = { ...draft, [amountKey]: Number(draft[amountKey]) }
  if (!Number.isFinite(data[amountKey]) || missingRequired(kind, draft, amountKey)) throw new Error('请输入有效金额')
  if (kind === 'income') {
    if (missingRequired(kind, draft, 'incDate')) throw new Error('请选择收入日期')
  } else {
    data.transactionAmount = Number(draft.transactionAmount)
    if (!Number.isFinite(data.transactionAmount) || missingRequired(kind, draft, 'transactionAmount')) throw new Error('请输入交易金额')
    if (missingRequired(kind, draft, 'expenseTypeId') || missingRequired(kind, draft, 'payTypeId') || missingRequired(kind, draft, 'expenseTime')) throw new Error('请选择支出类型、支付方式和日期')
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
