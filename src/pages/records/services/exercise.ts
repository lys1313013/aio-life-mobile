import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchExercisePage(page = 1, exerciseTypeId = '') { return request<any>('/exerciseRecord/query', 'GET', { page, pageSize: 100, exerciseTypeId }) }
export function saveExercise(payload) { return request<boolean>('/exerciseRecord' + (payload.id ? '/' + recordId(payload.id) : ''), payload.id ? 'PUT' : 'POST', payload) }
export function deleteExercises(ids: string[]) { return request('/exerciseRecord/deleteBatch', 'POST', { idList: ids.map(recordId) }) }
export function fetchCategoryTypes() { return request<any[]>('/userDictType/dictTypeEnum') }
export function fetchCategoryPage(page = 1, dictType = 'exercise_type') { return request<any>('/userDictData/query', 'GET', { page, pageSize: 100, dictType }) }
export function saveCategory(payload) { return request<boolean>('/userDictData', payload.id ? 'PUT' : 'POST', payload) }
export function deleteCategory(id) { return request('/userDictData/' + recordId(id), 'DELETE') }
