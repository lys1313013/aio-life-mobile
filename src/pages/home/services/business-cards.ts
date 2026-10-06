// 首页仅依赖轻量接口与展示规则，不同步引用业务分包。
export const businessCards = [
  { key: 'goal', title: '目标', cardKey: 'section.goal', route: '/pages/tasks/goals', endpoint: '/goals', pinned: true },
  { key: 'anniversary', title: '纪念日', cardKey: 'section.anniversary', route: '/pages/records/anniversary', endpoint: '/anniversaryRecords', pinned: true },
  { key: 'read', title: '阅读', cardKey: 'section.reading', route: '/pages/records/library?kind=read', endpoint: '/read-record', paged: true },
  { key: 'member', title: '会员', cardKey: 'section.membership', route: '/pages/member/index', endpoint: '/membership' },
  { key: 'movie', title: '观影', cardKey: 'section.movie', route: '/pages/records/library?kind=movie', endpoint: '/movie', paged: true },
]
// 卡片整体的几何上限，包括标题、内边距和列表。
export const businessCardMaxHeight = 280
export const businessCardRowHeight = 76
export const businessCardPageSize = 20
export function cardState() {
  return { rows: [], loading: false, moreLoading: false, loaded: false, error: '', moreError: '', locked: false, page: 0, more: false, version: 0, busy: false, available: true }
}
function compareId(a, b) { return a.length - b.length || a.localeCompare(b) }
export function dateDistance(date, today = new Date()) {
  const text = (date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const [year, month, day] = text.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000)
}
export function sortMemberships(rows, today = new Date()) {
  return rows.filter(row => {
    const days = dateDistance(row.expiryDate, today)
    return row.status !== 'expired' && days != null && days >= 0
  }).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || compareId(String(b.id), String(a.id)))
}
export function cardPath(card, page = 1) {
  if (card.pinned) return card.endpoint + '?isPinned=1'
  if (card.paged) return card.endpoint + '/page?activeOnly=true&inProgressFirst=true&current=' + page + '&size=' + businessCardPageSize
  return card.endpoint + '/list'
}
export function cardRows(card, data) {
  const rows = card.paged ? data?.items : data
  // 数字总数直接校验；旧服务端字符串仅在此读取边界转换，空值不能当作零。
  const total = typeof data?.total === 'string' && /^\d+$/.test(data.total) ? Number(data.total) : data?.total
  if (card.paged && (!Number.isSafeInteger(total) || total < 0)) throw new Error('卡片分页数据异常，请重试')
  if (!Array.isArray(rows) || rows.some(item => !item || typeof item.id !== 'string')) throw new Error('卡片数据异常，请重试')
  if (card.pinned && rows.some(item => item.isPinned !== 1)) throw new Error('服务端首页固定功能尚未就绪，请更新后重试')
  if (card.paged && rows.some(item => !['not_started', 'in_progress'].includes(item.status))) throw new Error('服务端首页状态筛选尚未就绪，请更新后重试')
  return card.key === 'member' ? sortMemberships(rows) : rows
}
// 分页失败不推进页码；刷新/离页先使旧请求失效，旧 finally 也不能清除新请求状态。
export async function loadBusinessCard(card, state, fetch, more = false) {
  if (more && (state.loading || state.moreLoading || !state.more || state.locked || state.error || state.busy)) return
  const version = more ? state.version : ++state.version
  if (!more) { state.loading = true; state.moreLoading = false; state.error = ''; state.moreError = '' }
  else { state.moreLoading = true; state.moreError = '' }
  const page = more ? state.page + 1 : 1
  try {
    const data = await fetch(cardPath(card, page))
    if (state.version !== version) return
    const rows = cardRows(card, data)
    const seen = new Set(more ? state.rows.map(item => item.id) : [])
    const unique = rows.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true })
    state.rows = more ? [...state.rows, ...unique] : unique
    state.page = page
    state.more = !!card.paged && rows.length > 0 && unique.length > 0 && page * businessCardPageSize < Number(data.total)
    state.loaded = true
    state.locked = false
  } catch (error) {
    if (state.version !== version) return
    if (error.name === 'SecondaryLockRequiredError') {
      state.rows = []; state.locked = true; state.more = false; state.loaded = true
    } else if (more) state.moreError = error.message || '加载失败，请重试'
    else state.error = error.message || '加载失败，请重试'
  } finally {
    if (state.version === version) { state.loading = false; state.moreLoading = false }
  }
}
// 配色 A：按完成进度分段，Web 与 mobile 保持一致。
export function goalProgressColor(percent) {
  if (percent <= 33) return '#788faf'
  if (percent <= 66) return '#618f9d'
  return '#69957a'
}
export function cardProgress(card, item) {
  if (card.key === 'goal') return item.targetValue > 0 ? Math.max(0, Math.min(100, Math.round((item.currentValue || 0) / item.targetValue * 100))) : item.status === 'completed' ? 100 : 0
  if ((card.key === 'read' || card.key === 'movie') && item.totalProgress > 0) return Math.max(0, Math.min(100, Math.round((item.currentProgress || 0) / item.totalProgress * 100)))
  return null
}
export function cardCaption(card, item) {
  if (card.key === 'anniversary') {
    const days = dateDistance(item.targetDate)
    return (item.targetDate || '').slice(0, 10) + (days == null ? '' : days === 0 ? ' · 就是今天' : days > 0 ? ' · 还有 ' + days + ' 天' : ' · 已经 ' + -days + ' 天')
  }
  if (card.key === 'member') {
    const days = dateDistance(item.expiryDate)
    return days == null ? '未设置到期日' : item.expiryDate.slice(0, 10) + (days < 0 ? ' · 已过期 ' + -days + ' 天' : days === 0 ? ' · 今天到期' : ' · 剩余 ' + days + ' 天')
  }
  const statuses = card.key === 'goal' ? { in_progress: '进行中', completed: '已完成', on_hold: '已搁置', shelved: '已搁置', paused: '已搁置', not_started: '未开始' } : card.key === 'read' ? { in_progress: '在读', not_started: '想读' } : { in_progress: '在看', not_started: '想看' }
  const parts = [statuses[item.status] || item.status || '']
  if (card.key === 'goal') return parts[0]
  if (item.totalProgress > 0) parts.push((item.currentProgress || 0) + ' / ' + item.totalProgress)
  else if (item.currentProgress > 0) parts.push(String(item.currentProgress))
  return parts.filter(Boolean).join(' · ')
}

// 依赖菜单请求的普通失败保留内容；服务端明确要求解锁时清除受保护数据。
export function failBusinessAccess(state, error) {
  state.version++
  state.loading = false; state.moreLoading = false
  if (error.name === 'SecondaryLockRequiredError') {
    state.rows = []; state.more = false; state.locked = true; state.loaded = true; state.error = ''
  } else state.error = error.message || '权限检查失败，请重试'
}
