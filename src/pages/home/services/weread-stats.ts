export type WereadStatsGranularity = 'week' | 'month' | 'year'
export type WereadStatsBucket = { key: string; label: string; seconds: number }
export type WereadStatsData = {
  connected: boolean
  granularity: WereadStatsGranularity
  periodStart: string
  periodEnd: string
  elapsedDays: number
  buckets: WereadStatsBucket[]
  totalSeconds: number
  dailyAverageSeconds: number
  previousPeriodStart: string
  previousPeriodEnd: string
  previousTotalSeconds: number
  refreshInterval: number
}
export const wereadStatsModes: Array<{ key: WereadStatsGranularity; label: string }> = [
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
]
const storageKey = owner => 'aio-life-mobile:home:weread-stats:granularity:' + owner

function isCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function readWereadStatsGranularity(owner: string, storage: any): WereadStatsGranularity {
  if (!owner) return 'week'
  try {
    const value = storage.getStorageSync(storageKey(owner))
    return wereadStatsModes.some(mode => mode.key === value) ? value : 'week'
  } catch { return 'week' }
}

export function saveWereadStatsGranularity(owner: string, value: WereadStatsGranularity, storage: any) {
  if (!owner || !wereadStatsModes.some(mode => mode.key === value)) return
  try { storage.setStorageSync(storageKey(owner), value) } catch { /* 存储受限时本次切换仍可使用。 */ }
}

export function readWereadStats(raw: any, granularity: WereadStatsGranularity): WereadStatsData {
  if (!raw || raw.granularity !== granularity || typeof raw.connected !== 'boolean'
    || typeof raw.periodStart !== 'string' || typeof raw.periodEnd !== 'string'
    || !isCount(raw.elapsedDays) || raw.elapsedDays < 1
    || !isCount(raw.totalSeconds) || !isCount(raw.dailyAverageSeconds)
    || !isCount(raw.previousTotalSeconds) || !isCount(raw.refreshInterval) || raw.refreshInterval < 1
    || !Array.isArray(raw.buckets)
    || raw.buckets.some(bucket => !bucket || typeof bucket.key !== 'string' || typeof bucket.label !== 'string' || !isCount(bucket.seconds))) {
    throw Error('阅读统计数据异常，请重试')
  }
  if (raw.connected && raw.buckets.length === 0) throw Error('阅读统计数据异常，请重试')
  return raw as WereadStatsData
}

export function formatWereadDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '0 分钟'
  if (seconds < 60) return '不足 1 分钟'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes + ' 分钟'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? hours + ' 小时 ' + rest + ' 分' : hours + ' 小时'
}

export function wereadStatsChange(totalSeconds: number, previousTotalSeconds: number) {
  if (previousTotalSeconds <= 0) {
    return totalSeconds > 0 ? { direction: 1, text: '新增' } : { direction: 0, text: '—' }
  }
  const percent = Math.round((totalSeconds - previousTotalSeconds) / previousTotalSeconds * 100)
  if (percent === 0) return { direction: 0, text: '持平' }
  return { direction: percent > 0 ? 1 : -1, text: (percent > 0 ? '+' : '') + percent + '%' }
}

// 柱高按周期最大值等比缩放；零值不绘制柱体，日期位置与点击区域由组件保留。
export function wereadBarHeights(buckets: Array<{ seconds: number }>, height: number) {
  const usable = Math.max(16, height)
  const max = Math.max(1, ...buckets.map(bucket => bucket.seconds))
  return buckets.map(bucket => bucket.seconds > 0 ? Math.max(3, Math.round(bucket.seconds / max * usable)) : 0)
}

export function wereadBucketDate(bucket: { key: string }, granularity: WereadStatsGranularity) {
  if (granularity === 'year') {
    const [year, month] = bucket.key.split('-')
    return year + '年' + Number(month) + '月'
  }
  const [, month, day] = bucket.key.split('-')
  return Number(month) + '月' + Number(day) + '日'
}

export function wereadBucketLabel(bucket: { label: string }, granularity: WereadStatsGranularity) {
  if (granularity === 'week') return bucket.label.replace(/^周/, '')
  if (granularity === 'year') return bucket.label.replace(/月$/, '')
  return bucket.label
}
