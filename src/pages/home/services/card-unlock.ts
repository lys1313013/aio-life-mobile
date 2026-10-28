import { checkMenuAccess } from '../../../services/menu-access.ts'
import { session } from '../../../services/session.ts'
import { unlockNavigationRevision } from '../../../services/secondary-lock.ts'

let pending = false

// 卡片解锁只校验依赖菜单并刷新卡片，不产生待恢复的页面导航。
export async function unlockHomeCard(routes: string[], refresh: () => Promise<void>, active: () => boolean) {
  if (pending || !active() || !session.token) return
  const token = session.token, revision = unlockNavigationRevision()
  const current = () => active() && session.token === token && unlockNavigationRevision() === revision
  pending = true
  try {
    try {
      for (const route of new Set(routes)) {
        if (!current()) return
        await checkMenuAccess(route)
      }
    } finally {
      // 数据刷新期间允许操作其他卡片，只合并尚未结束的密码验证。
      pending = false
    }
    if (current()) await refresh()
  } catch (error) {
    if (current() && error.message !== '已取消解锁') {
      uni.showToast({ title: error.message || '解锁失败，请重试', icon: 'none' })
    }
  }
}
