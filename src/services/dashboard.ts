import { request } from './api.ts'
import { readDateRecords } from './time-response.ts'

export interface OverviewCard {
  titleClickUrl?: string
  iconClickUrl?: string
  type: string
  title: string
  totalTitle?: string
  totalValue?: string
  value?: string
  valueColor?: string
  icon?: string
  iconColor?: string
  loading?: boolean
  error?: string
  refreshInterval?: number | null
  locked?: boolean
}
export interface QuickLink {
  menuId: string
  title: string
  path: string
  icon?: string
  color?: string
  enabled: number
  sortOrder: number
}
export interface Thought {
  id: string
  content: string
  hiddenContent?: boolean
  createTime?: string
}
export interface WatchedTask {
  taskId?: string
  id: string
  content: string
  taskName?: string
  isCompleted: number
  priority?: number
  sort?: number
  isStarred?: number
  startTime?: string | null
  endTime?: string | null
}
export interface ExerciseItem {
  icon?: string
  exerciseTypeId: string
  typeLabel: string
  count: number
  color?: string
  deltaCount?: number
  trend?: { date: string; count: number }[]
}
export interface ExerciseDay {
  date: string
  items: ExerciseItem[]
}
export interface ExercisePage {
  days: ExerciseDay[]
  lastDate?: string
  hasMore?: boolean
}
export interface Commit {
  id: string
  repo: string
  message: string
  date: string
  commitUrl?: string
}
export interface Category {
  icon?: string
  id: string
  name: string
  parentId?: string
  color?: string
  isEnabled?: number
  timeType?: number
  isTrackTime?: number
}
export interface TimeRecord {
  id: string
  categoryId: string
  startTime: number
  endTime: number
  date?: string
  title?: string
  description?: string
  relateId?: string | null
  relateType?: number | null
  exercises?: { exerciseTypeId: string; exerciseCount?: number; description?: string }[]
}

// 首页读取不主动弹二级密码，锁定状态由卡片提供明确的解锁入口。
const homeRequest = <T>(path: string) => request<T>(path, 'GET', null, true, null, true)
export const getOverview = () => homeRequest<OverviewCard[]>('/dashboard/tasks')
export const getCard = (type: string) =>
  homeRequest<OverviewCard>('/dashboard/card/' + encodeURIComponent(type))
export const getQuickLinks = () => homeRequest<QuickLink[]>('/quick-nav/my?client=mobile')
export const getThoughts = () => homeRequest<Thought[]>('/thought/dashboard')
export const getWatched = () => homeRequest<WatchedTask[]>('/taskDetails/watched')
export const getExercises = (lastDate = '') =>
  homeRequest<ExercisePage>(
    '/exerciseRecord/dashboardSummary?limit=7' +
      (lastDate ? '&lastDate=' + encodeURIComponent(lastDate) : ''),
  )
export const getCommits = (page = 1) =>
  homeRequest<Commit[]>('/github/recent-commits?perPage=10&page=' + page)
export async function getGithubProfile() {
  const bindings = await homeRequest<{ platform: string; platformUsername?: string }[]>('/userbinds/list')
  const name = bindings.find(item => item.platform === 'github')?.platformUsername || ''
  return /^[a-z\d][a-z\d-]*$/i.test(name) ? 'https://github.com/' + encodeURIComponent(name) : ''
}
export function todayDate() {
  const now = new Date()
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  )
}
export async function getTime(date = todayDate()) {
  const [categories, records] = await Promise.all([
    homeRequest<Category[]>('/timeTrackerCategory/list'),
    getDateRecords(date, true),
  ])
  return { categories, records }
}
/** 单日接口一次返回完整列表；失败继续交由调用端显示重试。 */
export async function getDateRecords(date: string, silent = false): Promise<TimeRecord[]> {
  return readDateRecords(await request('/timeRecord/query?date=' + encodeURIComponent(date), 'GET', null, true, null, silent))
}
