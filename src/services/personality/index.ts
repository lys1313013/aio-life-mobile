import { request, apiUrl } from '../api.ts'
import { session } from '../session.ts'
import { readResponse } from '../contract.ts'
import { entityId, mbtiPayload, cbtiPayload, personalityPayload, cbtiResult } from './contract.ts'
export function createMbti() {return request('/mbti/test','POST')}
export function checkMbti(testId) {return request('/mbti/test/'+encodeURIComponent(testId))}
export function saveMbti(testId,result) {return request('/mbti/result','POST',mbtiPayload(testId,result))}
export async function history(kind) {const data=await request('/'+kind+'/results'); if(!Array.isArray(data)) throw Error('历史数据异常'); data.forEach(row=>entityId(row.id)); return data}
export function getHistory(kind,id) {return request('/'+kind+'/result/'+entityId(id))}
export function deleteHistory(kind,id) {return request('/'+kind+'/result/'+entityId(id),'DELETE')}
export function getQuestions() {return request('/cbti/questions')}
export async function getPersonalities(admin=false) {const rows=await request('/cbti/'+(admin ? 'admin/' : '')+'personalities'); if(!Array.isArray(rows))throw Error('人格列表异常'); if(admin)rows.forEach(row=>entityId(row.id)); return rows}
export async function submitCbti(questions,answers,hidden) {return cbtiResult(await request('/cbti/test','POST',cbtiPayload(questions,answers,hidden)))}
export function savePersonality(form,id=null) {return request('/cbti/admin/personalities'+(id ? '/'+entityId(id) : ''),id ? 'PUT' : 'POST',personalityPayload(form))}
export function deletePersonality(id) {return request('/cbti/admin/personalities/'+entityId(id),'DELETE')}
export function uploadPersonality(code) {
 return new Promise((resolve,reject)=>{uni.chooseImage({count:1,success(selected){ const token=session.token; uni.uploadFile({url:apiUrl('/cbti/admin/personalities/'+encodeURIComponent(code)+'/image'),filePath:selected.tempFilePaths[0],name:'file',header:{Authorization:'Bearer '+token},success(response){try{if(token!==session.token)throw Error('登录状态已变化');const data=readResponse(response.statusCode,JSON.parse(response.data));if(!data?.imageObject || !data?.imageUrl)throw Error('人格图片上传结果异常');resolve(data)}catch(reason){reject(reason)}},fail:()=>reject(Error('上传失败，请重试'))})},fail:()=>reject(Error('未选择图片'))})})
}
