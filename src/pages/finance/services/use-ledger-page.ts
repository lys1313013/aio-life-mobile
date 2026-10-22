import { ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDomainPage } from '../../../services/domains/page-session.ts'

type LedgerInstance = {
  resume: (refresh: boolean) => unknown
  suspend: (clear: boolean) => void
  loading: boolean
  error: string
}

export function useLedgerPage(kind: 'expense' | 'income') {
  const mounted = ref(false), visible = ref(false), ledger = ref<LedgerInstance | null>(null)
  const initialCreate = ref(false)
  onLoad(options => { initialCreate.value = options?.create === '1' })
  let pendingRefresh: boolean | null = null

  function resumeReadyLedger() {
    if (!visible.value || !ledger.value || pendingRefresh === null) return
    const refresh = pendingRefresh
    pendingRefresh = null
    return ledger.value.resume(refresh)
  }

  // 微信通过视图层回填组件引用，普通 nextTick 结束时引用可能仍为空。
  // 保留会话的刷新决策，等真实引用就绪后执行，不能静默丢掉首次查询。
  watch(ledger, resumeReadyLedger, { flush: 'post' })
  useDomainPage(
    refresh => {
      mounted.value = true
      visible.value = true
      pendingRefresh = pendingRefresh === true || refresh
      return resumeReadyLedger()
    },
    clear => {
      visible.value = false
      if (clear) initialCreate.value = false
      pendingRefresh = null
      ledger.value?.suspend(clear)
    },
    {
      loading: () => !!ledger.value?.loading,
      error: () => ledger.value?.error || '',
      keys: () => [kind, 'userDictData', 'userDictType'],
    },
  )
  return { mounted, visible, ledger, initialCreate }
}
