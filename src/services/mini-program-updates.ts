export const buildSeenKey = 'aio-life-mobile.build-seen.v1'

/** 使用构建时间识别同一版本号下的不同发布包；由微信负责下载和应用新代码包。 */
export function installMiniProgramUpdates(runtime, buildId: string) {
  const manager = runtime.getUpdateManager()
  let ready = false
  let prompting = false
  let applying = false
  let downloadedPrompted = false
  let changedBuild = false
  if (buildId) {
    try {
      const seen = runtime.getStorageSync(buildSeenKey)
      const existingData = runtime.getStorageInfoSync().keys.some(key => key.startsWith('aio-life-mobile.') && key !== buildSeenKey)
      changedBuild = seen !== buildId && (!!seen || existingData)
      runtime.setStorageSync(buildSeenKey, buildId)
    } catch (_) { /* 版本记录不可用时仍允许正常使用和更新，不重置任何用户数据。 */ }
  }

  function errorNotice(message: string) {
    runtime.showModal({ title: '更新失败', content: message, showCancel: false })
  }
  function apply() {
    if (!ready || applying) return
    applying = true
    try {
      // 更新仅替换微信代码包，不能调用清理存储、退出登录或重置设置的流程。
      manager.applyUpdate()
    } catch (_) {
      applying = false
      downloadedPrompted = false
      errorNotice('重启失败，请重新打开小程序。')
    }
  }
  function prompt() {
    if (prompting || applying || (ready ? downloadedPrompted : !changedBuild)) return
    const downloaded = ready
    if (downloaded) downloadedPrompted = true
    else changedBuild = false
    prompting = true
    runtime.showModal({
      title: downloaded ? '发现新版本' : '更新完成',
      content: downloaded ? '重启后生效，请先保存未提交内容。' : '新版本已生效。',
      confirmText: downloaded ? '立即更新' : '知道了', cancelText: '稍后', showCancel: downloaded,
      success(result) {
        prompting = false
        if (downloaded && result.confirm) apply()
        if (!downloaded && ready) prompt()
      },
      fail() { prompting = false; downloadedPrompted = false },
    })
  }
  manager.onUpdateReady(() => { ready = true; prompt() })
  manager.onUpdateFailed(() => {
    ready = false
    downloadedPrompted = false
    errorNotice('下载失败，请重新打开小程序。')
  })
  prompt()
}
