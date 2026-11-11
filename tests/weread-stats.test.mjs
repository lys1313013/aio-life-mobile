import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [new URL('../src/pages/home/services/weread-stats.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const {
  formatWereadDuration,
  readWereadStats,
  readWereadStatsGranularity,
  saveWereadStatsGranularity,
  wereadBarHeights,
  wereadBucketDate,
  wereadBucketLabel,
  wereadStatsChange,
} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

function payload(overrides = {}) {
  return {
    connected: true,
    granularity: 'week',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    elapsedDays: 5,
    buckets: [
      { key: '2026-11-02', label: '周一', seconds: 2100 },
      { key: '2026-11-03', label: '周二', seconds: 1800 },
      { key: '2026-11-04', label: '周三', seconds: 0 },
    ],
    totalSeconds: 3900,
    dailyAverageSeconds: 780,
    previousPeriodStart: '2026-10-26',
    previousPeriodEnd: '2026-10-30',
    previousTotalSeconds: 3000,
    refreshInterval: 600,
    ...overrides,
  }
}

test('阅读统计响应校验粒度、数值与柱子结构', () => {
  assert.deepEqual(readWereadStats(payload(), 'week'), payload())
  assert.equal(readWereadStats(payload({ connected: false, buckets: [], totalSeconds: 0 }), 'week').connected, false)
  assert.throws(() => readWereadStats(payload({ granularity: 'month' }), 'week'), /阅读统计数据异常/)
  assert.throws(() => readWereadStats(payload({ totalSeconds: -1 }), 'week'), /阅读统计数据异常/)
  assert.throws(() => readWereadStats(payload({ elapsedDays: 0 }), 'week'), /阅读统计数据异常/)
  assert.throws(() => readWereadStats(payload({ refreshInterval: 0 }), 'week'), /阅读统计数据异常/)
  assert.throws(() => readWereadStats(payload({ buckets: [{ key: '1', label: '周一', seconds: '10' }] }), 'week'), /阅读统计数据异常/)
  assert.throws(() => readWereadStats(payload({ connected: true, buckets: [] }), 'week'), /阅读统计数据异常/)
})

test('时段粒度按账号保存，未知值回退周', () => {
  const values = new Map()
  const storage = {
    getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => values.set(key, value),
  }
  assert.equal(readWereadStatsGranularity('user1', storage), 'week')
  saveWereadStatsGranularity('user1', 'month', storage)
  assert.equal(readWereadStatsGranularity('user1', storage), 'month')
  assert.equal(readWereadStatsGranularity('user2', storage), 'week')
  saveWereadStatsGranularity('user2', 'year', storage)
  assert.equal(readWereadStatsGranularity('user2', storage), 'year')
  values.set('aio-life-mobile:home:weread-stats:granularity:user3', 'day')
  assert.equal(readWereadStatsGranularity('user3', storage), 'week')
})

test('时长格式化与同期变化覆盖零值、增长和下降', () => {
  assert.equal(formatWereadDuration(0), '0 分钟')
  assert.equal(formatWereadDuration(40), '不足 1 分钟')
  assert.equal(formatWereadDuration(35 * 60 + 20), '35 分钟')
  assert.equal(formatWereadDuration(3900), '1 小时 5 分')
  assert.equal(formatWereadDuration(7200), '2 小时')
  assert.deepEqual(wereadStatsChange(3900, 3000), { direction: 1, text: '+30%' })
  assert.deepEqual(wereadStatsChange(3000, 3900), { direction: -1, text: '-23%' })
  assert.deepEqual(wereadStatsChange(3000, 0), { direction: 1, text: '新增' })
  assert.deepEqual(wereadStatsChange(0, 0), { direction: 0, text: '—' })
  assert.deepEqual(wereadStatsChange(3000, 3000), { direction: 0, text: '持平' })
})

test('柱高按最大值等比缩放，零值不绘制柱体', () => {
  const heights = wereadBarHeights([{ seconds: 3600 }, { seconds: 1800 }, { seconds: 0 }], 100)
  assert.equal(heights[0], 100)
  assert.equal(heights[1], 50)
  assert.equal(heights[2], 0)
  assert.deepEqual(wereadBarHeights([], 100), [])
  assert.deepEqual(wereadBarHeights([{ seconds: 0 }, { seconds: 0 }], 4), [0, 0])
})

test('年视图按月、周与月视图按日生成提示日期', () => {
  assert.equal(wereadBucketDate({ key: '2026-11-02' }, 'week'), '11月2日')
  assert.equal(wereadBucketDate({ key: '2026-11-02' }, 'month'), '11月2日')
  assert.equal(wereadBucketDate({ key: '2026-03' }, 'year'), '2026年3月')
})

test('横轴简写周和月份，提示日期保留完整单位', () => {
  assert.deepEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(label => wereadBucketLabel({ label }, 'week')), ['一', '二', '三', '四', '五', '六', '日'])
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => wereadBucketLabel({ label: (i + 1) + '月' }, 'year')), Array.from({ length: 12 }, (_, i) => String(i + 1)))
  assert.equal(wereadBucketLabel({ label: '29' }, 'month'), '29')
})
