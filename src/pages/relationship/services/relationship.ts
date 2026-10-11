import { request } from '../../../services/domains/session-guard.ts'
import { queryPath } from '../../../services/query-path.ts'
export const fetchGraph = () => request<any>('/relationships/graph')
export const searchPeople = (keyword:string) => request<any[]>(queryPath('/relationships/persons/search',{keyword}))
export const fetchPerson = (id:string) => request<any>('/relationships/persons/'+encodeURIComponent(id))
export const savePerson = (data:Record<string,any>) => request('/relationships/persons'+(data.id?'/'+encodeURIComponent(data.id):''),data.id?'PUT':'POST',data)
export const deletePerson = (id:string) => request('/relationships/persons/'+encodeURIComponent(id),'DELETE')
export const saveRelationship = (data:Record<string,any>) => request('/relationships'+(data.id?'/'+encodeURIComponent(String(data.id)):''),data.id?'PUT':'POST',data)
export const deleteRelationship = (data:Record<string,any>) => request('/relationships','DELETE',data)
