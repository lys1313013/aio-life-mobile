import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export interface ExerciseStatisticsPoint {
  exerciseTypeId: string
  exerciseDate: string
  exerciseCount: number
  recordCount: number
}
export function fetchExercisePage(page = 1, exerciseTypeId = '', startDate = '', endDate = '') {
  return request<any>('/exerciseRecord/query', 'GET', { page, pageSize: 20, exerciseTypeId, startDate, endDate })
}
export function fetchExerciseStatistics(exerciseTypeId = '', startDate = '', endDate = '') {
  return request<ExerciseStatisticsPoint[]>('/exerciseRecord/statistics/summary', 'GET', { exerciseTypeId, startDate, endDate })
}
export function saveExercise(payload) { return request<boolean>('/exerciseRecord' + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteExercises(ids: string[]) { return request('/exerciseRecord/deleteBatch', 'POST', { idList: ids.map(recordId) }) }
export function fetchCategoryTypes() { return request<any[]>('/userDictType/dictTypeEnum') }
export function fetchCategoryPage(page = 1, dictType = 'exercise_type') { return request<any>('/userDictData/query', 'GET', { page, pageSize: 100, dictType }) }
export function saveCategory(payload) { return request<boolean>('/userDictData', payload.id ? 'PUT' : 'POST', payload) }
export function deleteCategory(id) { return request('/userDictData/' + recordId(id), 'DELETE') }
