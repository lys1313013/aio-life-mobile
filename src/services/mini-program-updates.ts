/** 由微信负责下载和应用新代码包，仅在待重启更新时请求确认。 */
export function installMiniProgramUpdates(runtime) {
  const manager = runtime.getUpdateManager()
  let ready = false
  let prompting = false
  let applying = false
  let downloadedPrompted = false

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
    if (!ready || prompting || applying || downloadedPrompted) return
    downloadedPrompted = true
    prompting = true
    runtime.showModal({
      title: '发现新版本',
      content: '重启后生效，请先保存未提交内容。',
      confirmText: '立即更新', cancelText: '稍后', showCancel: true,
      success(result) {
        prompting = false
        if (result.confirm) apply()
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
}
