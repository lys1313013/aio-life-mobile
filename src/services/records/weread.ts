import { request } from '../api.ts'
export function fetchWereadConnection(){return request<any>('/weread/connection')}
export function connectWeread(apiKey){return request<any>('/weread/connection','POST',{apiKey},true,null,false,30000)}
export function disconnectWeread(){return request('/weread/disconnect','POST')}
export function syncWeread(mode='annually',baseTime=0){return request<any>('/weread/sync?mode='+encodeURIComponent(mode)+'&baseTime='+baseTime,'POST',null,true,null,false,120000)}
export function fetchWereadStats(mode,baseTime=0){return request<any>('/weread/stats','GET',{mode,baseTime},true,null,false,30000)}
export function fetchWereadNotes(bookId){return request<any>('/weread/notes','GET',{bookId},true,null,false,120000)}
export function fetchWereadProgress(bookId){return request<any>('/weread/progress','GET',{bookId},true,null,false,120000)}
