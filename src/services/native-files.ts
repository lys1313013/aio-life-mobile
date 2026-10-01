export type SelectedDocument = { name: string; path: string; size: number; temporary?: boolean }
export const IMPORT_FILE_LIMIT = 16 * 1024 * 1024
export function validateDocument(file: SelectedDocument, extensions: string[] = [], maxBytes = IMPORT_FILE_LIMIT) {
  if (!file || !file.path || !file.name) throw new Error('未选择文件')
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > maxBytes) throw new Error('文件大小不能超过 ' + Math.floor(maxBytes / 1024 / 1024) + ' MiB')
  const suffix=file.name.split('.').pop()?.toLowerCase() || ''
  if (extensions.length && !extensions.map(value=>value.replace(/^\./,'').toLowerCase()).includes(suffix)) throw new Error('请选择 ' + extensions.join('、') + ' 文件')
  return file
}
export function chooseDocument(options: { extensions?: string[]; maxBytes?: number } = {}): Promise<SelectedDocument> {
  const extensions=options.extensions || [],maxBytes=options.maxBytes ?? Number.POSITIVE_INFINITY
  return new Promise((resolve,reject)=>{
    const selected=async(result:any)=>{try{const file=result.tempFiles?.[0];const value=validateDocument({name:file?.name,path:file?.path,size:Number(file?.size)},extensions,maxBytes)
      // #ifdef APP
      const safeName=value.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const cachePath=uni.env.CACHE_PATH+'/aio-document-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'-'+safeName
      await new Promise<void>((done,fail)=>uni.getFileSystemManager().copyFile({srcPath:value.path,destPath:cachePath,success:()=>done(),fail:()=>fail(new Error('无法读取所选文档，请重新选择'))}))
      value.path=cachePath;value.temporary=true
      // #endif
      resolve(value)
    }catch(error){reject(error)}}
    const failed=(error:any)=>reject(new Error(error?.errCode===1101001 || /cancel/i.test(error?.errMsg || '')?'未选择文件':'无法打开文件选择器，请重试'))
    // #ifdef WEB
    uni.chooseFile({count:1,type:'all',...(extensions.length?{extension:extensions}:{}),success:selected,fail:failed})
    // #endif
    // #ifdef MP-WEIXIN
    wx.chooseMessageFile({count:1,type:'file',...(extensions.length?{extension:extensions}:{}),success:selected,fail:failed})
    // #endif
    // #ifdef APP
    // App不支持extension过滤；选择完成后校验。Android content URI复制到沙盒，供解析和uploadFile共用。
    uni.chooseFile({count:1,type:'all',success:selected,fail:failed})
    // #endif
  })
}
export async function readDocument(file: SelectedDocument, binary = true): Promise<ArrayBuffer|string> {
  // #ifdef WEB
  const response=await fetch(file.path)
  if(!response.ok)throw new Error('读取文件失败')
  return binary?response.arrayBuffer():response.text()
  // #endif
  // #ifndef WEB
  return new Promise((resolve,reject)=>uni.getFileSystemManager().readFile({filePath:file.path,...(binary?{}:{encoding:'utf-8'}),success:result=>resolve(result.data as ArrayBuffer|string),fail:()=>reject(new Error('读取文件失败，请重试'))}))
  // #endif
}
export async function releaseDocument(file: SelectedDocument): Promise<void> {
  // #ifdef APP
  if(file.temporary)await new Promise<void>(resolve=>uni.getFileSystemManager().unlink({filePath:file.path,complete:()=>resolve()}))
  // #endif
}
