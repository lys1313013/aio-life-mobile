import { nextTick } from 'vue'
import { clearSession } from './session.ts'
import { clearLifeCatalogCache } from './life-catalog-cache.ts'
import { theme, refreshNativeTheme } from './theme.ts'

/** 清理客户端持久化数据和登录关联的内存缓存，不调用服务端删除接口。 */
export async function clearClientData() {
  // 先使旧请求和账号内存缓存失效，再清存储，避免迟到响应重新填入缓存。
  clearSession()
  await nextTick()
  clearLifeCatalogCache()
  uni.clearStorageSync()
  theme.mode = 'system'
  refreshNativeTheme()
  // #ifdef MP-WEIXIN
  const saved = await new Promise<any>((resolve, reject) => uni.getSavedFileList({
    success: resolve, fail: () => reject(new Error('本地文件缓存读取失败，请重试')),
  }))
  for (const file of saved.fileList) {
    await new Promise<void>((resolve, reject) => uni.removeSavedFile({
      filePath: file.filePath, success: () => resolve(), fail: () => reject(new Error('本地文件缓存清理失败，请重试')),
    }))
  }
  // 应用自行生成、未进入 saveFile 列表的临时文件；不操作微信管理的代码包和系统目录。
  const fs = uni.getFileSystemManager()
  const directory = uni.env.USER_DATA_PATH
  for (const name of fs.readdirSync(directory)) {
    if (/^(aio-output-|bank-card-cover-|CBTI-)/.test(name) && !name.includes('/')) fs.unlinkSync(directory + '/' + name)
  }
  // #endif
}
