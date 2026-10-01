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

export function modalAvailableHeight(windowHeight, keyboardHeight, safeTop = 0, safeBottom = 0) {
  return Math.max(80, windowHeight - keyboardHeight - safeTop - safeBottom - spacing.overlayBlock * 2)
}

export function chartGeometry(labels, series, width, height = 180) {
  if (!Array.isArray(labels) || !labels.length) return { min: 0, max: 1, zero: height, series: [] }
  for (const item of series) if (!Array.isArray(item.values) || item.values.length !== labels.length || item.values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('图表数据与标签不一致')
  const values = series.flatMap(item => item.values)
  const min = Math.min(0,...values), max = Math.max(0,...values) || (min === 0 ? 1 : 0), span = max - min || 1
  const y = value => height - (value-min)/span*height
  return { min,max,zero:y(0),series:series.map(item => {
    const points=item.values.map((value,index)=>({x: labels.length === 1 ? width/2 : index*width/(labels.length-1),y:y(value),value}))
    const segments=points.slice(1).map((point,index)=>{const previous=points[index],dx=point.x-previous.x,dy=point.y-previous.y;return {left:previous.x,top:previous.y,length:Math.sqrt(dx*dx+dy*dy),angle:Math.atan2(dy,dx)*180/Math.PI}})
    return {...item,points,segments}
  }) }
}
