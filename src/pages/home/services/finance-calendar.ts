export type LedgerKind = 'income' | 'expense'
export type FinanceKind = LedgerKind | 'finance'
export type FinanceMetric = 'income' | 'expense' | 'balance'
export type Granularity = 'day' | 'week' | 'month' | 'year'
export type CalendarBucket = { key: string; label: string; startDate: string | null; endDate: string | null; amount: number; future: boolean; income?: number; expense?: number; balance?: number }
export type FinanceCalendar = { granularity: Granularity; date: string | null; today: string; amount: number; buckets: CalendarBucket[]; refreshInterval: number; income?: number; expense?: number; balance?: number }
export const calendarModes = [{ key: 'day', label: '日' }, { key: 'week', label: '周' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }]
export function modesFor(kind: FinanceKind) { return calendarModes.filter(mode => kind === 'expense' || mode.key !== 'day') }
export function chinaDay(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) }
const storageKey = (kind, owner) => 'aio-life-mobile:home:' + kind + ':granularity:' + owner
export function readCalendarMode(kind: FinanceKind, owner: string, storage: any): Granularity {
  const fallback = kind === 'expense' ? 'day' : 'week'
  if (!owner) return fallback
  try { const value = storage.getStorageSync(storageKey(kind, owner)); return modesFor(kind).some(mode => mode.key === value) ? value : fallback } catch { return fallback }
}
export function saveCalendarMode(kind: FinanceKind, owner: string, mode: Granularity, storage: any) {
  if (!owner || !modesFor(kind).some(item => item.key === mode)) return
  try { storage.setStorageSync(storageKey(kind, owner), mode) } catch { /* 存储受限时本次切换仍可使用。 */ }
}
export function calendarScope(kind: FinanceKind, granularity: Granularity, cursor = '', today = chinaDay()) {
  const date = granularity === 'year' ? null : (cursor || today).slice(0, granularity === 'month' ? 4 : 7)
  return { kind, key: kind + ':' + granularity + ':' + (date || ''), granularity, date, path: '/home/sections/' + kind + '/calendar?granularity=' + granularity + (date ? '&date=' + date : '') }
}
export function readCalendar(raw: any, scope): FinanceCalendar {
  if (!raw || raw.granularity !== scope.granularity || raw.date !== scope.date || typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || !Array.isArray(raw.buckets) || raw.buckets.some(row => !row || typeof row.key !== 'string' || typeof row.amount !== 'number' || !Number.isFinite(row.amount))) throw Error('收支日历数据异常，请重试')
  if (scope.kind === 'finance' && [raw, ...raw.buckets].some(row => ['income', 'expense', 'balance'].some(key => typeof row[key] !== 'number' || !Number.isFinite(row[key])))) throw Error('收支汇总数据异常，请重试')
  return raw
}
function dateISO(date: Date) { return date.toISOString().slice(0, 10) }
export function moveCalendarDate(date: string, granularity: Granularity, delta: number) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7)) || 1
  return dateISO(new Date(Date.UTC(year + (granularity === 'month' ? delta : 0), month - 1 + (granularity === 'month' ? 0 : delta), 1)))
}
export function calendarPlaceholder(scope, today = chinaDay()): FinanceCalendar {
  const { granularity, date } = scope, buckets: CalendarBucket[] = []
  const start = new Date((date?.length === 4 ? date + '-01' : date || today.slice(0, 4) + '-01') + '-01T00:00:00Z')
  const year = start.getUTCFullYear(), month = start.getUTCMonth()
  const push = (first: Date, end: Date, label: string) => buckets.push({ key: dateISO(first), startDate: dateISO(first), endDate: dateISO(end), amount: 0, income: 0, expense: 0, balance: 0, label, future: dateISO(first) > today })
  if (granularity === 'day' || granularity === 'week') {
    const end = new Date(Date.UTC(year, month + 1, 1)), cursor = new Date(start)
    while (cursor < end) {
      const first = new Date(cursor), step = granularity === 'day' ? 1 : 7 - ((cursor.getUTCDay() + 6) % 7)
      cursor.setUTCDate(cursor.getUTCDate() + step)
      if (cursor > end) cursor.setTime(end.getTime())
      push(first, cursor, granularity === 'day' ? String(first.getUTCDate()) : '第' + (buckets.length + 1) + '周')
    }
  } else if (granularity === 'month') {
    for (let index = 0; index < 12; index++) push(new Date(Date.UTC(year, index, 1)), new Date(Date.UTC(year, index + 1, 1)), (index + 1) + '月')
  } else push(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)), year + '年')
  return { granularity, date, today, amount: 0, income: 0, expense: 0, balance: 0, buckets, refreshInterval: 300 }
}
export function calendarMoney(amount: number, compact = false) {
  // 显式格式化，适配小程序运行时的 Intl 支持。
  const fixed = amount.toFixed(2)
  if (compact) return fixed.replace(/\.?0+$/, '')
  const parts = fixed.split('.')
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1]
}
export function calendarPeriod(bucket: CalendarBucket) {
  if (!bucket.startDate || !bucket.endDate) return bucket.label
  const end = new Date(bucket.endDate + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() - 1)
  const last = dateISO(end)
  return bucket.startDate === last ? last : bucket.startDate + ' — ' + last
}
export function detailQuery(kind: LedgerKind, bucket: CalendarBucket, page = 1, pageSize = 20) {
  const suffix = kind === 'expense' ? ' 00:00:00' : ''
  return { page, pageSize, ...(bucket.startDate && bucket.endDate ? { startTime: bucket.startDate + suffix, endTimeBefore: bucket.endDate + suffix } : { undated: true }) }
}
export function detailState() { return { items: [], page: 0, hasMore: true, loading: false, loaded: false, error: '' } }
// 弹窗共用触底分页；错误重试原页，离页与账号切换的响应不回填。
export function createDetailsController(state, fetch, active, commit = (_result) => {}) {
  let version = 0, replacePending = false
  function invalidate() { version++; state.loading = false }
  function reset(retain = false) {
    invalidate(); replacePending = true; state.page = 0; state.hasMore = true; state.error = ''
    if (!retain) { state.items = []; state.loaded = false }
  }
  async function load() {
    if (!active() || state.loading || !state.hasMore) return
    const stamp = ++version, nextPage = state.page + 1
    state.loading = true; state.error = ''
    try {
      const result = await fetch(nextPage)
      if (!active() || stamp !== version) return
      const total = typeof result?.total === 'string' && /^\d+$/.test(result.total) ? Number(result.total) : result?.total
      if (!Array.isArray(result?.items) || result.items.some(row => typeof row?.id !== 'string') || (total != null && (!Number.isSafeInteger(total) || total < 0))) throw Error('明细数据异常，请重试')
      const previous = replacePending ? [] : state.items
      const known = new Set(previous.map(row => row.id))
      state.items = [...previous, ...result.items.filter(row => { if (known.has(row.id)) return false; known.add(row.id); return true })]
      state.page = nextPage; state.loaded = true; replacePending = false
      commit(result)
      state.hasMore = result.items.length > 0 && (total == null ? result.items.length === 20 : state.items.length < total)
    } catch (error) {
      if (active() && stamp === version) {
        if (error.name === 'ForbiddenError' || error.name === 'SecondaryLockRequiredError') { state.items = []; state.loaded = false; state.page = 0 }
        state.error = error.message || '加载失败，请重试'
      }
    }
    finally { if (active() && stamp === version) state.loading = false }
  }
  return { load, invalidate, reset }
}
