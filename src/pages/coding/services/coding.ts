import { request } from '../../../services/domains/session-guard.ts'
import { queryPath } from '../../../services/query-path.ts'
import { openExternalLink } from '../../../services/external-link.ts'

// 三端统一读取当前账号绑定的数据；平台凭证只由服务端使用。
export const fetchCodingBindings = () => request<any[]>(queryPath('/userbinds/list', { includeToken: false }))
export const fetchCommits = (page = 1) => request<any[]>(queryPath('/github/recent-commits', { page, pageSize: 20 }))
export const fetchCsdnStats = (username: string) => request<any>(queryPath('/csdn/stats', { username }))
export const fetchCsdnArticles = (username: string, limit = 20) => request<any[]>(queryPath('/csdn/articles', { username, limit }))
export async function fetchRepos() {
  const repos: any[] = []
  for (let page = 1; ; page++) {
    const rows = await request<any[]>(queryPath('/github/repos', { page }))
    repos.push(...rows)
    if (rows.length < 100) return repos
  }
}
export const fetchRepoContributors = (fullName: string) => request<any[]>(queryPath('/github/repository/contributors', { name: fullName.split('/')[1] }))
export const fetchRepoInfo = (fullName: string) => request<any>(queryPath('/github/repository/info', { name: fullName.split('/')[1] }))
export const fetchGithubCalendar = () => request<any>('/github/calendar')
export const fetchLeetcodeProfile = () => request<any>('/leetcode/data/profile')
export const fetchLeetcodeContest = () => request<any>('/leetcode/data/contest')
export const fetchLeetcodeCalendar = () => request<any>('/leetcode/data/calendar')
export const fetchLeetcodeDaily = () => request<any>('/leetcode/data/daily')
export const fetchLeetcodeRecent = () => request<any>('/leetcode/data/recent')
export function openExternal(url: string) {
  if (!/^https:\/\/[^\s\\]+$/i.test(url)) throw new Error('链接无效')
  openExternalLink(url)
}
export function calendarSummary(days:{date:string,count:number}[],today:string){const sorted=days.filter(day=>day.date<=today).sort((a,b)=>a.date.localeCompare(b.date));let streak=0;for(let i=sorted.length-1;i>=0;i--){if(sorted[i].count>0)streak++;else if(sorted[i].date!==today)break}return{today:sorted.find(day=>day.date===today)?.count||0,streak,total:sorted.reduce((n,day)=>n+day.count,0),active:sorted.filter(day=>day.count>0).length}}
