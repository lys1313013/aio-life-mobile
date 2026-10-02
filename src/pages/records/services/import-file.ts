import { chooseDocument, readDocument, releaseDocument, IMPORT_FILE_LIMIT } from '../../../services/native-files.ts'
// 共享官方选文件适配：Web、微信文件、App缓存拷贝；不新增依赖。
export async function chooseImportFile(extensions = ['xlsx'], binary = true): Promise<{ name: string; data: any }> {
  const file = await chooseDocument({ extensions, maxBytes: IMPORT_FILE_LIMIT })
  try { return { name: file.name, data: await readDocument(file, binary) } }
  finally { await releaseDocument(file) }
}
