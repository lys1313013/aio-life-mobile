// 仅记录成功写入的版本，不缓存业务数据；首页返回时按区域更新。
const revisions: Record<string, number> = {}
export function homeDataRevision(key: string) { return revisions[key] || 0 }
export function invalidateHomeAfterWrite(path: string, method: string) {
  if (method === 'GET') return
  const root = path.split('?')[0].split('/')[1]
  const keys: Record<string, string[]> = {
    timeRecord: ['time', 'exercise', 'overview.EXERCISE', 'overview.TIME_TRACKER'],
    timeTrackerCategory: ['time'],
    exerciseRecord: ['exercise', 'overview.EXERCISE'],
    exerciseType: ['exercise', 'time'],
    thought: ['thoughts'],
    taskDetails: ['watched'], tasks: ['watched'], taskColumn: ['watched'],
    'quick-nav': ['links'],
    goals: ['goal'], anniversaryRecords: ['anniversary'],
    'read-record': ['read'], movie: ['movie'], membership: ['member'],
    home: ['preferences'], menu: ['preferences', 'access', 'links'],
    github: ['commits', 'overview.GITHUB'], leetcode: ['overview.LEETCODE'],
    weread: ['overview.READ', 'overview.WEREAD'], shanbay: ['overview.SHANBAY'],
    user: ['profile'], userbinds: ['profile', 'overview'],
    auth: ['access'],
  }
  for (const key of keys[root] || []) revisions[key] = homeDataRevision(key) + 1
}
