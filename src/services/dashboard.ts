import { request } from './api.ts'

export interface OverviewCard {
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
  id: string
  content: string
  taskName?: string
  isCompleted: number
  priority?: number
}
export interface ExerciseItem {
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
  id: string
  name: string
  parentId?: string
  color?: string
}
export interface TimeRecord {
  id: string
  categoryId: string
  startTime: number
  endTime: number
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
export async function getTime() {
  const now = new Date()
  const date =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  const [categories, records] = await Promise.all([
    request<Category[]>('/timeTrackerCategory/all'),
    request<{ items: TimeRecord[] }>('/timeRecord/query?date=' + date),
  ])
  return { categories, records: records.items || [] }
}
