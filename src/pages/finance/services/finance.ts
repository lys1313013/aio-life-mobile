import { queryPath } from '../../../services/query-path.ts'
export { queryPath } from '../../../services/query-path.ts'
import { request } from '../../../services/domains/session-guard.ts'
export { ledgerId, ledgerPayload, fetchDictionary, saveLedger, deleteLedger } from '../../../services/domains/finance-entry.ts'
export const fetchLedger = (kind: string, params: Record<string, any>) => request<{items: any[], total: number | null}>(queryPath('/' + kind + '/query', params))
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

export const moveCardOrder = (data: { id: string; targetId: string; after: boolean }) => request<any[]>('/bank-cards/order', 'PUT', data)
