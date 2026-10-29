/** 平台文件出口；鉴权、响应校验及业务文件名由调用方负责。 */
export function releaseOutputFile(path: string) {
  if (!path) return
  // #ifdef WEB
  URL.revokeObjectURL(path)
  // #endif
  // #ifndef WEB
  uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} })
  // #endif
}

export async function createOutputFile(data: ArrayBuffer, filename: string, type: string): Promise<string> {
  // #ifdef WEB
  return URL.createObjectURL(new Blob([data], { type }))
  // #endif
  // #ifndef WEB
  let directory = ''
  // #ifdef MP-WEIXIN
  directory = uni.env.USER_DATA_PATH
  // #endif
  // #ifdef APP
  directory = uni.env.CACHE_PATH
  // #endif
  const safeName = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
  const destination = directory + '/aio-output-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + safeName
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().writeFile({ filePath: destination, data,
      success: () => resolve(destination),
      fail: () => { releaseOutputFile(destination); reject(Error('文件保存失败，请重试')) },
    })
  })
  // #endif
}

/** 消费临时文件：浏览器下载、微信分享、App 保存，成功和失败都释放临时资源。 */
export async function saveOutputFile(path: string, filename: string): Promise<string> {
  // #ifdef WEB
  try {
    const link = document.createElement('a')
    link.href = path
    link.download = filename
    link.click()
    return '已开始下载'
  } finally { setTimeout(() => releaseOutputFile(path), 60000) }
  // #endif
  // #ifdef MP-WEIXIN
  try {
    await new Promise<void>((resolve, reject) => uni.shareFileMessage({ filePath: path, fileName: filename,
      success: () => resolve(), fail: () => reject(Error('未完成文件保存或分享，可重试')),
    }))
    return '已分享文件'
  } finally { releaseOutputFile(path) }
  // #endif
  // #ifdef APP
  try {
    const saved = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: path,
      success: result => resolve(result.savedFilePath), fail: () => reject(Error('文件保存失败，请重试')),
    }))
    return '已保存至 ' + saved
  } finally { releaseOutputFile(path) }
  // #endif
}
