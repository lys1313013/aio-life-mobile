import { request } from '../../../services/domains/session-guard.ts'
import { queryPath } from '../../../services/query-path.ts'
export const fetchMessages = (isRead: boolean | null = null) => request<any[]>(queryPath('/message/list',{isRead}))
export const markRead = (id:string) => request('/message/read/'+encodeURIComponent(id),'PUT')
export const markAllRead = () => request('/message/read-all','PUT')
export const deleteMessage = (id:string) => request('/message/'+encodeURIComponent(id),'DELETE')
export const sendMessage = (data:Record<string,any>) => request<any[]>('/message','POST',data)
export const fetchAdminMessages = (params:Record<string,any>) => request<any>(queryPath('/message/admin/list',params))
export const adminSendMessage = (data:Record<string,any>) => request('/message/admin/send','POST',data)
export const adminDeleteMessage = (id:string) => request('/message/admin/'+encodeURIComponent(id),'DELETE')
export const fetchUserBasic = (id:string) => request<any>('/user/'+encodeURIComponent(id)+'/basic')
