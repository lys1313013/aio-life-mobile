import { request as apiRequest } from '../api.ts'
import { session } from '../session.ts'
export async function request<T>(path:string, method:'GET'|'POST'|'PUT'|'DELETE'='GET', data:any=null):Promise<T>{const token=session.token;if(!token)throw new Error('请先登录');const result=await apiRequest<T>(path,method,data);if(session.token!==token)throw new Error('登录状态已变化，请重试');return result}
