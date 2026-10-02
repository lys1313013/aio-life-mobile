import { request } from '../../../services/api.ts'
import { recordId } from '../../../services/records/contracts.ts'
export function fetchVideoPage(page=1,status=''){return request<any>('/b-video/query','GET',{page,pageSize:100,status})}
export function saveVideo(payload){return request<boolean>('/b-video'+(payload.id?'/'+recordId(payload.id):''),payload.id?'PUT':'POST',payload)}
export function deleteVideo(id){return request<boolean>('/b-video/'+recordId(id),'DELETE')}
export function fetchVideoCounts(){return request<any>('/b-video/getStatusCount')}
export function fetchVideoStatistics(){return request<any>('/b-video/statistics')}
export function extractVideoId(url){const bv=url.match(/BV[a-z0-9]{10}/i),av=url.match(/av(\d+)/i);if(!bv&&!av)throw new Error('请输入包含 BV 或 av 号的视频链接');return bv?{bvid:bv[0]}:{aid:av[1]}}
export async function parseVideoLink(url){const id=extractVideoId(url),query=id.bvid?'bvid='+encodeURIComponent(id.bvid):'aid='+id.aid;let result:any
// #ifdef WEB
result=await new Promise((resolve,reject)=>{const callback='aioVideo_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script');const cleanup=()=>{clearTimeout(timer);script.remove();delete window[callback]};const timer=setTimeout(()=>{cleanup();reject(new Error('视频信息读取超时，请重试或手动填写'))},15000);window[callback]=data=>{cleanup();resolve(data)};script.onerror=()=>{cleanup();reject(new Error('视频信息读取失败，请重试或手动填写'))};script.src='https://api.bilibili.com/x/web-interface/view?'+query+'&callback='+callback+'&jsonp=jsonp';document.head.append(script)})
// #endif
// #ifndef WEB
result=await new Promise((resolve,reject)=>{uni.request({url:'https://api.bilibili.com/x/web-interface/view?'+query,timeout:15000,success:response=>{if(response.statusCode!==200){reject(new Error('视频信息读取失败'));return};resolve(response.data)},fail:()=>reject(new Error('视频信息读取失败，请重试或手动填写'))})})
// #endif
if(result?.code!==0||!result.data)throw new Error(result?.message||'视频解析失败');const data=result.data,pages=data.pages||[],episode=Math.max(1,Math.min(Number(url.match(/[?&]p=(\d+)/)?.[1]||1),data.videos||1)),duration=Number(data.duration||0);const watched=pages.slice(0,episode-1).reduce((sum,page)=>sum+Number(page.duration||0),0);return {title:data.title||'',cover:data.pic||'',duration,episodes:data.videos||1,currentEpisode:episode,watchedDuration:Math.min(watched,duration),bvid:data.bvid||id.bvid||'',aid:String(data.aid||id.aid||''),description:data.desc||'',ownerName:data.owner?.name||'',pagesInfo:JSON.stringify(pages),url:'https://www.bilibili.com/video/'+(data.bvid||id.bvid||'av'+id.aid)+(episode>1?'?p='+episode:'')}
}
