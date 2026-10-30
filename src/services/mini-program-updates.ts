export const buildSeenKey = 'aio-life-mobile.build-seen.v1'
export const updateCleanedKey = 'aio-life-mobile.update-cleaned.v1'

/** 使用构建时间识别同一版本号下的不同发布包；由微信负责下载和应用新代码包。 */
export function installMiniProgramUpdates(runtime, buildId: string, clearData: () => Promise<void>) {
  const manager = runtime.getUpdateManager()
  let ready = false
  let prompting = false
  let applying = false
  let downloadedPrompted = false
  const seen = runtime.getStorageSync(buildSeenKey)
  const cleanedBeforeUpdate = runtime.getStorageSync(updateCleanedKey) === true
  const existingData = runtime.getStorageInfoSync().keys.some(key => key.startsWith('aio-life-mobile.') && key !== buildSeenKey && key !== updateCleanedKey)
  let changedBuild = !!buildId && seen !== buildId && (!!seen || existingData) && !cleanedBeforeUpdate
  if (buildId && (!changedBuild || cleanedBeforeUpdate)) runtime.setStorageSync(buildSeenKey, buildId)
  runtime.removeStorageSync(updateCleanedKey)

  function errorNotice(message: string) {
    runtime.showModal({ title: '未完成更新', content: message, showCancel: false })
  }
  async function apply(downloaded: boolean) {
    applying = true
    try {
      await clearData()
      if (downloaded) {
        // 新包启动后不重复弹出“已更新”清理提示。
        runtime.setStorageSync(updateCleanedKey, true)
        manager.applyUpdate()
      } else {
        if (buildId) runtime.setStorageSync(buildSeenKey, buildId)
        changedBuild = false
        await new Promise<void>((resolve, reject) => runtime.reLaunch({ url: '/pages/login/index', success: () => resolve(), fail: reject }))
      }
    } catch (_) {
      runtime.removeStorageSync(updateCleanedKey)
      downloadedPrompted = false
      errorNotice('清理或重启未完成，请重新打开小程序后重试。')
    } finally {
      applying = false
      // 处理清理期间刚下载完成的新包。
      if (!downloaded && ready) prompt()
    }
  }
  function prompt() {
    if (prompting || applying || (ready ? downloadedPrompted : !changedBuild)) return
    const downloaded = ready
    if (downloaded) downloadedPrompted = true
    prompting = true
    runtime.showModal({
      title: downloaded ? '新版本已准备好' : '已更新到新版本',
      content: '清除本机缓存、登录状态和本地设置后重新进入，需要重新登录。云端数据不受影响，请先保存未提交的内容。',
      confirmText: downloaded ? '清理更新' : '清理重进', cancelText: '稍后',
      success(result) {
        prompting = false
        if (result.confirm) void apply(downloaded)
        else {
          if (!downloaded) changedBuild = false
          if (ready && !downloaded) prompt()
        }
      },
      fail() { prompting = false; downloadedPrompted = false },
    })
  }
  manager.onUpdateReady(() => { ready = true; prompt() })
  manager.onUpdateFailed(() => {
    ready = false
    downloadedPrompted = false
    errorNotice('新版本下载失败，当前数据未清理。请检查网络并重新打开小程序。')
  })
  prompt()
}
