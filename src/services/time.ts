import { request } from './api.ts'
import { getDateRecords } from './dashboard.ts'
import type { Category, TimeRecord } from './dashboard.ts'
import { periodRange } from './time-format.ts'
import { statuses } from './records/contracts.ts'

export const getCategories = () =>
  request<Category[]>('/timeTrackerCategory/list')
export async function getPeriodRecords(date: string, mode: string) {
  if (mode === 'day')
    return (await getDateRecords(date)).map((record) => ({
      ...record,
      date: record.date || date,
    }))
  const range = periodRange(date, mode)
  return request<TimeRecord[]>(
    '/timeRecord/queryByDateRange?startDate=' +
      range.start +
      '&endDate=' +
      range.end,
  )
}
export const getRecord = (id: string) =>
  request<TimeRecord | null>('/timeRecord/' + encodeURIComponent(id))
export const recommendNext = (date: string) =>
  request<{ recommend: TimeRecord | null; records: TimeRecord[] }>(
    '/timeRecord/recommendNext?date=' + date,
  )
export const createRecord = (data: TimeRecord) =>
  request<string>('/timeRecord', 'POST', data)
export const updateRecord = (data: TimeRecord) =>
  request('/timeRecord/' + encodeURIComponent(data.id), 'PUT', data)
export const deleteRecord = (id: string) =>
  request('/timeRecord/' + encodeURIComponent(id), 'DELETE')
export const getExerciseTypes = () =>
  request<{ dictDetailList: { id: string; dictLabel: string; icon?: string; color?: string }[] }>(
    '/userDictType/getByDictType?dictType=exercise_type',
  )
export const getRelateTypes = () =>
  request<{ label: string; value: number }[]>('/timeRecord/relateTypes')
export interface RelatedRecord {
  id: string
  title: string
  fileId?: string
  coverImgUrl?: string
  status?: string
  startTime?: string | null
  finishTime?: string | null
}
export const getRelatedRecord = (type: number, id: string) =>
  request<RelatedRecord | null>((type === 1 ? '/read-record/' : '/movie/') + encodeURIComponent(id))
export async function updateRelatedStatus(type: number, id: string, status: string) {
  if (![1, 2].includes(type) || !id || !statuses.includes(status)) throw new Error('关联状态无效')
  const record = await getRelatedRecord(type, id)
  if (!record || record.id !== id) throw new Error('关联记录暂时无法读取')
  if (record.status === status) return
  // 后端会为进行中/已完成补齐日期；带回已有日期，避免覆盖原来的开始、完成时间。
  await request(type === 1 ? '/read-record' : '/movie', 'PUT', {
    id, status, startTime: record.startTime, finishTime: record.finishTime,
  })
}
export function getRelated(
  type: number,
  keyword: string,
  page: number,
  all: boolean,
) {
  return request<{ items: RelatedRecord[]; total: number }>(
    (type === 1 ? '/read-record/page' : '/movie/page') +
      '?current=' +
      page +
      '&size=24&activeOnly=' +
      !all +
      (type === 1 ? '&inProgressFirst=true&title=' : '&title=') +
      encodeURIComponent(keyword),
  )
}
