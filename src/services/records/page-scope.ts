import { onUnmounted } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { session } from '../session.ts'
import { currentPageAccess } from '../page-refresh.ts'
// 离页或跨账号请求即使成功也不能重新写回旧表单、附件或详情。
export function createRecordScope(clear: (clearData: boolean) => void) {
  let active = true, revision = 0, owner = session.token, shown = false
  const pending = new Set<() => void>()
  function inactiveError() { const error = new Error('页面已离开'); error.name = 'PageInactiveError'; return error }
  function invalidate() {
    revision++
    // 立即结束页面等待，让 finally 收起 loading；传输本身仍会被下方处理器接住。
    for (const cancel of [...pending]) cancel()
  }
  onHide(() => { active = false; invalidate(); clear(false) })
  onShow(() => {
    active = true
    // 首次进入没有旧数据；不能因菜单预取尚未完成清掉 onLoad 的编辑参数。
    if (owner !== session.token || (shown && currentPageAccess().expired)) { owner = session.token; invalidate(); clear(true) }
    shown = true
  })
  onUnmounted(() => { active = false; invalidate() })
  function wait<T>(promise: Promise<T>): Promise<T> {
    const token = session.token, current = revision
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const cancel = () => {
        if (finished) return
        finished = true
        pending.delete(cancel)
        reject(inactiveError())
      }
      const finish = (success: boolean, value: any) => {
        if (finished) return
        if (!active || current !== revision || token !== session.token) { cancel(); return }
        finished = true
        pending.delete(cancel)
        if (success) resolve(value)
        else reject(value)
      }
      pending.add(cancel)
      // 即使调用时页面已失效，也注册拒绝处理器，避免晚到的网络失败成为未处理异常。
      promise.then(result => finish(true, result), error => finish(false, error))
      if (!active) cancel()
    })
  }
  return { wait }
}
