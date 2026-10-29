import { ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useDomainPage } from '../../../services/domains/page-session.ts'

type LedgerInstance = {
  resume: (refresh: boolean) => unknown
  suspend: (clear: boolean) => void
  loading: boolean
  error: string
}

export function useLedgerPage(kind: 'expense' | 'income') {
  const mounted = ref(false), visible = ref(false), ledger = ref<LedgerInstance | null>(null)
  const awaitingLedger = ref(true)
  const initialCreate = ref(false)
  onLoad(options => { initialCreate.value = options?.create === '1' })
  let pendingRefresh: boolean | null = null

  function resumeReadyLedger() {
    if (!visible.value || !ledger.value || pendingRefresh === null) return
    const refresh = pendingRefresh
    pendingRefresh = null
    const result = ledger.value.resume(refresh)
    // resume(true) 会同步开启真实 loading；仅挂载或恢复活动状态还不能撤掉首屏占位。
    if (refresh) awaitingLedger.value = false
    return result
  }

  // 微信通过视图层回填组件引用，普通 nextTick 结束时引用可能仍为空。
  // 保留会话的刷新决策，等真实引用就绪后执行，不能静默丢掉首次查询。
  watch(ledger, resumeReadyLedger, { flush: 'post' })
  // 同一会话返回时保留已经挂载的内容；下方会话/权限检查会同步清除不可再显示的数据。
  onShow(() => { if (mounted.value) visible.value = true })
  const { initializing } = useDomainPage(
    refresh => {
      mounted.value = true
      visible.value = true
      pendingRefresh = pendingRefresh === true || refresh
      return resumeReadyLedger()
    },
    clear => {
      visible.value = false
      if (clear) {
        initialCreate.value = false
        awaitingLedger.value = true
      }
      pendingRefresh = null
      ledger.value?.suspend(clear)
    },
    {
      loading: () => !!ledger.value?.loading,
      error: () => ledger.value?.error || '',
      keys: () => [kind, 'userDictData', 'userDictType'],
    },
  )
  return { mounted, visible, ledger, initialCreate, initializing, awaitingLedger }
}
