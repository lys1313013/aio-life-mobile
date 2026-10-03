import { request } from './api.ts'

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

export const getOverview = () => request<OverviewCard[]>('/dashboard/tasks')
export const getCard = (type: string) =>
  request<OverviewCard>('/dashboard/card/' + encodeURIComponent(type))
export const getQuickLinks = () => request<QuickLink[]>('/quick-nav/my')
export const getThoughts = () => request<Thought[]>('/thought/dashboard')
export const getWatched = () => request<WatchedTask[]>('/taskDetails/watched')
export const getExercises = (lastDate = '') =>
  request<ExercisePage>(
    '/exerciseRecord/dashboardSummary?limit=7' +
      (lastDate ? '&lastDate=' + encodeURIComponent(lastDate) : ''),
  )
export const getCommits = (page = 1) =>
  request<Commit[]>('/github/recent-commits?perPage=10&page=' + page)
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
    request<Category[]>('/timeTrackerCategory/list'),
    getDateRecords(date),
  ])
  return { categories, records }
}
export async function getDateRecords(date: string): Promise<TimeRecord[]> {
  const records: TimeRecord[] = []
  let page = 1
  while (true) {
    const result = await request<{ items: TimeRecord[]; total?: number | string }>(
      '/timeRecord/query?date=' + encodeURIComponent(date) + '&pageSize=100&page=' + page,
    )
    const items = result.items || []
    const added = items.filter(item => !records.some(record => record.id === item.id))
    records.push(...added)
    if (result.total == null || records.length >= Number(result.total)) return records
    if (added.length === 0) throw new Error('记录未完整加载，请重试')
    page++
  }
}
