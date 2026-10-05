import spacing from '../styles/spacing.json'
// 纯逻辑，无平台或 DOM 依赖；状态交给调用方的 reactive 包装。
export function createLatestTask() {
  let generation = 0
  let active = true
  return {
    begin() { active = true; return ++generation },
    isCurrent(token) { return active && token === generation },
    invalidate() { active = false; generation++ },
  }
}

export function createAsyncAction(state = { loading: false, error: '' }) {
  return {
    state,
    async run(action) {
      if (state.loading) return { executed: false }
      state.loading = true
      state.error = ''
      try {
        const value = await action()
        return { executed: true, value }
      } catch (error) {
        state.error = error instanceof Error ? error.message : '操作失败，请重试'
        throw error
      } finally {
        state.loading = false
      }
    },
  }
}

export function pickerValue(kind, value, options = []) {
  if (kind === 'selector') return options[Number(value)] || ''
  return String(value == null ? '' : value)
}

export function modalAvailableHeight(windowHeight, keyboardHeight, safeTop = 0, safeBottom = 0, verticalInset = spacing.overlayBlock) {
  return Math.max(80, windowHeight - keyboardHeight - safeTop - safeBottom - verticalInset * 2)
}
