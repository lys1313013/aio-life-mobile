import {request} from '../api.ts'
import {categoryPayload,flattenCategories,id,itemPayload,readItems} from './contract.ts'
export async function loadWardrobe(){const [items,categories,stats]=await Promise.all([request('/wardrobe/items'),request('/wardrobe/categories'),request('/wardrobe/stats')]);return {items:readItems(items),categories:flattenCategories(categories),stats}}
export async function itemDetail(value){const row=await request('/wardrobe/items/'+id(value));id(row.id);return row}
export function saveItem(form,original){return request('/wardrobe/items'+(original?'/'+id(original.id):''),original?'PUT':'POST',itemPayload(form))}
export function deleteItem(row){return request('/wardrobe/items/'+id(row.id),'DELETE')}
export function saveCategory(form,original){return request('/wardrobe/categories'+(original?'/'+id(original.id):''),original?'PUT':'POST',categoryPayload(form,original))}
export function deleteCategory(row){if(row.categoryType===0)throw Error('系统预设分类不可删除');return request('/wardrobe/categories/'+id(row.id),'DELETE')}
