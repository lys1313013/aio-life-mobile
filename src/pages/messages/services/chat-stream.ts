import { apiUrl } from '../../../services/api.ts'
import { session } from '../../../services/session.ts'
import { readResponse } from '../../../services/contract.ts'
export function sseTokens(buffer:string, onToken:(value:string)=>void): string {
  const blocks=buffer.replace(/\r\n/g,'\n').split('\n\n')
  const tail=blocks.pop() || ''
  blocks.forEach(block=>{const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.replace(/^data: ?/,'')).join('\n');if(data.startsWith('[ERROR]'))throw new Error(data.slice(7).trim());if(data && data!=='[DONE]')onToken(data)})
  return tail
}
export async function streamChat(prompt:string, conversationId:string, onToken:(value:string)=>void, signal?:any) {
  const token=session.token
  // #ifdef WEB
  const response=await fetch(apiUrl('/llm/chat/stream'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream',Authorization:'Bearer '+token},body:JSON.stringify({prompt,conversationId}),signal})
  if(!response.ok)throw new Error('AI 请求失败 '+response.status)
  const reader=response.body?.getReader();if(!reader)throw new Error('无法读取 AI 响应')
  const decoder=new TextDecoder();let buffer=''
  while(true){const chunk=await reader.read();if(session.token!==token){await reader.cancel();throw new Error('登录状态已变化')}if(chunk.done)break;buffer=sseTokens(buffer+decoder.decode(chunk.value,{stream:true}),onToken)}
  buffer+=decoder.decode();if(buffer.trim())sseTokens(buffer+'\n\n',onToken)
  // #endif
  // #ifndef WEB
  await new Promise<void>((resolve,reject)=>{
    let buffer='',received=false,settled=false
    const decoder=new Utf8Chunks()
    function done(error:any=null){if(settled)return;settled=true;signal?.removeEventListener?.('abort',abort);if(error)reject(error);else resolve()}
    const task:any=uni.request({url:apiUrl('/llm/chat/stream'),method:'POST',data:JSON.stringify({prompt,conversationId}),header:{'Content-Type':'application/json',Accept:'text/event-stream',Authorization:'Bearer '+token},enableChunked:true,dataType:'text',responseType:'text',timeout:120000,
      success:response=>{try{if(session.token!==token)throw new Error('登录状态已变化');if(response.statusCode<200||response.statusCode>=300)throw new Error('AI 请求失败 '+response.statusCode);if(!received&&typeof response.data==='string'){const raw=response.data;if(raw.trim().startsWith('{'))readResponse(response.statusCode,JSON.parse(raw));else buffer=sseTokens(raw,onToken)}if(buffer.trim())sseTokens(buffer+'\n\n',onToken);done()}catch(e){done(e)}},fail:error=>done(new Error(signal?.aborted?'已停止接收':'AI 连接失败，请重试'))})
    function abort(){task.abort();done(new Error('已停止接收'))}
    signal?.addEventListener?.('abort',abort)
    if(signal?.aborted){abort();return}
    if(typeof task.onChunkReceived==='function')task.onChunkReceived((chunk:any)=>{try{if(session.token!==token)throw new Error('登录状态已变化');received=true;buffer=sseTokens(buffer+decoder.decode(new Uint8Array(chunk.data)),onToken)}catch(e){task.abort();done(e)}})
  })
  // #endif
}

export function makeChatAbort(): any {
  // #ifdef WEB
  return new AbortController()
  // #endif
  // #ifndef WEB
  const callbacks:any[]=[]
  const signal={aborted:false,addEventListener:(_event:string,callback:any)=>{callbacks.push(callback)},removeEventListener:(_event:string,callback:any)=>{const index=callbacks.indexOf(callback);if(index>=0)callbacks.splice(index,1)}}
  return {signal,abort:()=>{signal.aborted=true;[...callbacks].forEach(callback=>callback())}}
  // #endif
}

// 跨端增量UTF-8解码，保留被HTTP chunk截断的汉字和四字节字符。
export class Utf8Chunks {
  pending:number[]=[]
  decode(bytes:Uint8Array):string{const input=[...this.pending,...Array.from(bytes)];let out='',i=0;this.pending=[];while(i<input.length){const first=input[i];let count=1,point=first;if(first>=0xf0){count=4;point=first&7}else if(first>=0xe0){count=3;point=first&15}else if(first>=0xc0){count=2;point=first&31}else if(first>=0x80)throw new Error('AI响应编码无效');if(i+count>input.length){this.pending=input.slice(i);break}for(let j=1;j<count;j++){const value=input[i+j];if((value&0xc0)!==0x80)throw new Error('AI响应编码无效');point=(point<<6)|(value&63)}out+=point<=0xffff?String.fromCharCode(point):String.fromCharCode(0xd800+((point-0x10000)>>10),0xdc00+((point-0x10000)&1023));i+=count}return out}
}
