import { pickQuery } from '../api-payload.ts'
import { request } from './session-guard.ts'
export function queryPath(path: string, params: Record<string, any> = {}) {
  const entries = Object.entries(pickQuery(path, params)).filter(([, value]) => value != null && value !== '')
  return path + (entries.length ? '?' + entries.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&') : '')
}
export function ledgerId(row: Record<string, any>): string { return String(row.id ?? row.incomeId ?? '') }
export function ledgerPayload(kind: string, draft: Record<string, any>) {
  const data = { ...draft, amt: Number(draft.amt) }
  if (!Number.isFinite(data.amt) || draft.amt === '') throw new Error('请输入有效金额')
  if (kind === 'income') {
    if (!draft.incDate) throw new Error('请选择收入日期')
  } else {
    data.transactionAmt = Number(draft.transactionAmt)
    if (!Number.isFinite(data.transactionAmt) || draft.transactionAmt === '') throw new Error('请输入交易金额')
    if (!draft.expTypeId || !draft.payTypeId || !draft.expTime) throw new Error('请选择支出类型、支付方式和日期')
  }
  return data
}
export const fetchLedger = (kind: string, params: Record<string, any>) => request<{items: any[], total: number}>(queryPath('/' + kind + '/query', params))
export const fetchDictionary = (dictType: string) => request<{dictDetailList: any[]}>(queryPath('/userDictType/getByDictType', {dictType}))
export const saveLedger = async (kind: string, draft: Record<string, any>) => {
  const data = ledgerPayload(kind, draft), id = ledgerId(draft)
  const result=await request('/' + kind + (kind === 'income' && id ? '/' + encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', data)
  if(result===false)throw new Error('记录未保存，请重试')
  return result
}
export const deleteLedger = async (kind: string, id: string) => {const result=await request('/' + kind + '/' + encodeURIComponent(id), 'DELETE');if(result===false)throw new Error('记录未删除，请重试');return result}
export const deleteExpenses = (idList: string[]) => request('/expense/deleteBatch', 'POST', {idList})
export const fetchFinanceStatistics = (kind: string, period: string = 'Month') => request<any[]>('/' + kind + '/statisticsBy' + period)
export const importExpenses = (rows: any[]) => request('/expense/saveBatch', 'POST', rows as any)
export const fetchCards = () => request<any[]>('/bank-cards')
export const fetchBanks = () => request<any[]>('/bank-cards/banks')
export const fetchCardTags = () => request<any[]>('/bank-cards/tags')
export const saveCard = (data: Record<string, any>, id: string = '') => request('/bank-cards' + (id ? '/' + encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', data)
export const deleteCard = (id: string) => request('/bank-cards/' + encodeURIComponent(id), 'DELETE')
export const revealCard = (id: string) => request<string>('/bank-cards/' + encodeURIComponent(id) + '/number', 'POST')
export const saveCardTag = (data: Record<string, any>, id: string = '') => request('/bank-cards/tags' + (id ? '/' + encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', data)
export const deleteCardTag = (id: string) => request('/bank-cards/tags/' + encodeURIComponent(id), 'DELETE')

export const fetchCardCoverTemplates = (bankId: string, cardType: string) => request<any[]>(queryPath('/bank-cards/cover-templates', {bankId, cardType}))
