import { chooseDocument, readDocument, releaseDocument, IMPORT_FILE_LIMIT } from '../native-files.ts'
import JSZip from 'jszip'
import { parseCSV, parseMobileCSV, parseWechatExcel } from './import-parser.ts'
import type { ParseContext } from './import-parser.ts'
export async function decodeBill(buffer: ArrayBuffer): Promise<string> {
  // #ifdef WEB
  const utf = new TextDecoder('utf-8', {fatal:true})
  try {return utf.decode(buffer)} catch {return new TextDecoder('gbk').decode(buffer)}
  // #endif
  // #ifndef WEB
  const bytes=new Uint8Array(buffer)
  let encoded='';bytes.forEach(value=>{encoded+='%'+value.toString(16).padStart(2,'0')})
  try{return decodeURIComponent(encoded)}catch{const codepage=await import('xlsx/dist/cpexcel.full.mjs');return codepage.utils.decode(936,bytes)}
  // #endif
}
export async function parseBillFile(name: string, buffer: ArrayBuffer, ctx: ParseContext) {
  if(name.toLowerCase().endsWith('.xlsx')) return parseWechatExcel(buffer,ctx)
  if(name.toLowerCase().endsWith('.zip')) {
    const zip=await JSZip.loadAsync(buffer)
    const csvName=Object.keys(zip.files).find(key=>key.toLowerCase().endsWith('.csv'))
    if(!csvName)throw new Error('压缩包中没有 CSV 账单')
    buffer=await zip.file(csvName)!.async('arraybuffer')
  } else if(!name.toLowerCase().endsWith('.csv')) throw new Error('请选择 CSV、ZIP 或微信 xlsx 账单')
  const text=await decodeBill(buffer)
  return text.includes('交易分类') ? parseMobileCSV(text,ctx) : parseCSV(text,ctx)
}
export async function chooseBill(): Promise<{name:string,buffer:ArrayBuffer}> {
  const file=await chooseDocument({extensions:['csv','zip','xlsx'],maxBytes:IMPORT_FILE_LIMIT})
  try{return {name:file.name,buffer:await readDocument(file) as ArrayBuffer}}finally{await releaseDocument(file)}
}
