// 设备条目复用共享编辑器在首页弹出，其余业务保留各自入口。
export const summaryCards = {
  memo: { title: '最近笔记', route: '/pages/records/notes?kind=memo', access: ['/pages/records/notes?kind=memo'], empty: '还没有笔记' },
  finance: { title: '收支概览', route: '/pages/finance/index', access: ['/pages/finance/index', '/pages/finance/income', '/pages/finance/expense'], empty: '' },
  income: { title: '收入', route: '/pages/finance/income', access: ['/pages/finance/income'], empty: '' },
  expense: { title: '支出', route: '/pages/finance/expense', access: ['/pages/finance/expense'], empty: '' },
  video: { title: '视频续看', route: '/pages/records/video', access: ['/pages/records/video'], empty: '暂无正在观看的视频' },
  device: { title: '我的设备', route: '/pages/goods/devices', access: ['/pages/goods/devices'], empty: '暂无在用设备' },
}
export function summaryState() {
  return { data: null, loading: false, error: '', locked: false, available: true, unlockRoute: '', at: 0, revision: -1, day: '', period: 'month' }
}
export function summaryDay(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) }
export function summaryMonth(now = new Date()) { return summaryDay(now).slice(0, 7) }
export const financeSummaryKinds = ['finance', 'income', 'expense']
export const summaryPeriods = [{ key: 'month', label: '本月' }, { key: 'year', label: '本年' }, { key: 'all', label: '全部' }]
export function summaryPeriodKey(period, now = new Date()) { return period === 'all' ? 'all' : summaryDay(now).slice(0, period === 'year' ? 4 : 7) }
export function readSummary(key, data) {
  if (!data || typeof data !== 'object') throw Error('卡片数据异常，请重试')
  if (financeSummaryKinds.includes(key)) {
    const period = data.period || 'month'
    const fields = key === 'finance' ? ['income', 'expense', 'balance'] : ['amount']
    if (!summaryPeriods.some(item => item.key === period) || fields.some(field => typeof data[field] !== 'number' || !Number.isFinite(data[field]))) throw Error('收支数据异常，请重试')
    return { period, label: data.label || data.month || '', month: data.month, ...Object.fromEntries(fields.map(field => [field, data[field]])), refreshInterval: data.refreshInterval }
  }
  if (!Array.isArray(data.items) || data.items.some(item => !item || typeof item.id !== 'string' || !item.id)) throw Error('卡片数据异常，请重试')
  const seen = new Set()
  const items = data.items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true }).slice(0, 3)
  // 即使旧服务端意外返回正文，首页状态也只保留笔记摘要。
  return { items: key === 'memo' ? items.map(({ id, title, hiddenContent, updateTime }) => ({ id, title, hiddenContent, updateTime })) : items, refreshInterval: data.refreshInterval }
}
export function summaryMoney(value) { return value == null || !Number.isFinite(Number(value)) ? '—' : '¥' + Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
export function summaryCaption(key, row) {
  if (key === 'memo') return (row.hiddenContent ? '正文已隐藏 · ' : '') + (row.updateTime || '').replace('T', ' ').slice(0, 16)
  if (key === 'device') return (row.usageDays == null ? '购买日期未设置' : '使用 ' + row.usageDays + ' 天') + ' · ' + (row.dailyCost == null ? '日均费用未设置' : summaryMoney(row.dailyCost) + '/天')
  const progress = Number.isFinite(row.progressPercent) ? Math.max(0, Math.min(100, row.progressPercent)) : 0
  return '第 ' + (row.currentEpisode || 1) + (row.episodes > 0 ? ' / ' + row.episodes : '') + ' 集 · ' + Math.round(progress) + '%'
}
export function summaryEntry(key, id = '') {
  const route = summaryCards[key].route
  return route + (id ? (route.includes('?') ? '&' : '?') + 'id=' + encodeURIComponent(id) : '')
}

// 摘要卡共用去重、旧响应隔离和保留内容逻辑；权限失败绝不能保留受保护数据。
export function createSummaryController(key, state, options) {
  let version = 0, pending = null
  const snapshots = new Map()
  const financial = !options.query && financeSummaryKinds.includes(key)
  function invalidate(clear = false) {
    version++; pending = null; state.loading = false
    if (clear) { snapshots.clear(); Object.assign(state, summaryState()) }
  }
  function clearData() { snapshots.clear(); state.data = null; state.at = 0 }
  async function refresh(force = true) {
    if (!options.active()) return
    if (pending) return pending
    const scope = options.query?.()
    const current = ++version, revision = options.revision(), period = scope?.key || state.period
    const bucket = scope ? summaryDay() : financial ? summaryPeriodKey(period) : key === 'device' ? summaryDay() : ''
    const valid = () => version === current && options.active() && (options.query ? options.query().key === period : state.period === period)
    state.loading = true; state.error = ''
    const task = (async () => {
      try {
        const access = await options.access()
        if (!valid()) return
        state.available = access.available
        state.locked = !!access.locked; state.unlockRoute = access.unlockRoute || ''
        if (!state.available || state.locked) { clearData(); return }
        const cached = snapshots.get(period)
        const interval = typeof cached?.data?.refreshInterval === 'number' && cached.data.refreshInterval > 0 ? cached.data.refreshInterval * 1000 : 300000
        if (!force && cached && cached.bucket === bucket && cached.revision === revision && Date.now() - cached.at < interval) {
          state.data = cached.data; state.at = cached.at; state.revision = revision
          return
        }
        const raw = await options.fetch(scope?.path || '/home/sections/' + key + (financial ? '?period=' + period : ''))
        const data = scope ? options.read(raw, scope) : readSummary(key, raw)
        if (!valid() || options.revision() !== revision) return
        if (financial && data.period !== period) throw Error('统计范围不一致，请重试')
        // 请求过程中二级锁可能到期；完成后再次检查，避免展示过期授权内容。
        const latest = await options.access()
        if (!valid() || options.revision() !== revision) return
        state.available = latest.available; state.locked = !!latest.locked; state.unlockRoute = latest.unlockRoute || ''
        if (!state.available || state.locked) { clearData(); return }
        state.data = data; state.at = Date.now(); state.revision = revision; state.day = summaryDay()
        snapshots.set(period, { data, at: state.at, revision, bucket: financial && period === 'month' ? data.month || bucket : bucket })
      } catch (error) {
        if (!valid()) return
        if (error.name === 'ForbiddenError') { clearData(); state.available = false }
        else if (error.name === 'SecondaryLockRequiredError') { clearData(); state.locked = true }
        else state.error = error.message || '加载失败，请重试'
      } finally {
        if (valid()) {
          state.loading = false; pending = null
          if (options.revision() !== revision) void refresh(true)
        }
      }
    })()
    pending = task
    return task
  }
  function setPeriod(period) {
    if (!financial || !summaryPeriods.some(item => item.key === period)) return Promise.resolve()
    if (period === state.period && !state.error) return pending || Promise.resolve()
    invalidate()
    state.period = period
    // 保留上一完整范围的金额和标签；成功后一起替换，失败也不会串范围。
    return refresh(false)
  }
  return { refresh, invalidate, setPeriod }
}
