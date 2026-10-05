import { onUnmounted } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import { session } from '../session.ts'
import { currentPageAccess } from '../page-refresh.ts'
// 离页或跨账号请求即使成功也不能重新写回旧表单、附件或详情。
export function createRecordScope(clear: (clearData: boolean) => void) {
  let active = true, revision = 0, owner = session.token, shown = false
  function inactiveError() { const error = new Error('页面已离开'); error.name = 'PageInactiveError'; return error }
  onHide(() => { active = false; revision++; clear(false) })
  onShow(() => {
    active = true
    // 首次进入没有旧数据；不能因菜单预取尚未完成清掉 onLoad 的编辑参数。
    if (owner !== session.token || (shown && currentPageAccess().expired)) { owner = session.token; revision++; clear(true) }
    shown = true
  })
  onUnmounted(() => { active = false; revision++ })
  async function wait<T>(promise: Promise<T>): Promise<T> {
    const token = session.token, current = revision
    try { const result = await promise; if (!active || current !== revision || token !== session.token) throw inactiveError(); return result }
    catch (error) { if (!active || current !== revision || token !== session.token) throw inactiveError(); throw error }
  }
  return { wait }
}
