import { request } from '../../../services/domains/session-guard.ts'
import { queryPath } from '../../../services/query-path.ts'
export function fetchCodingBindings(tokens=false) {
  // 微信的数据请求由后端携带平台凭证，客户端只读取公开绑定信息。
  // #ifdef MP-WEIXIN
  tokens=false
  // #endif
  return request<any[]>(queryPath('/userbinds/list',{includeToken:tokens}))
}
export const fetchCommits = (page=1) => request<any[]>(queryPath('/github/recent-commits',{page,perPage:20}))
export const fetchCsdnStats = (username:string) => request<any>(queryPath('/csdn/stats',{username}))
export const fetchCsdnArticles = (username:string,limit=20) => request<any[]>(queryPath('/csdn/articles',{username,limit}))
export function externalRequest(url:string, data:Record<string,any>|null=null, token=''):Promise<any>{return new Promise((resolve,reject)=>{uni.request({url,method:data?'POST':'GET',data,header:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},success:response=>{if(response.statusCode<200||response.statusCode>=300)reject(new Error('外部服务请求失败 '+response.statusCode));else if((response.data as any)?.errors)reject(new Error((response.data as any).errors[0].message));else resolve(response.data)},fail:()=>reject(new Error('外部服务连接失败，请重试'))})})}
export async function fetchRepos(username:string,token=''){
  const repos:any[]=[]
  for(let page=1;;page++){
    let rows:any[]
    // #ifdef MP-WEIXIN
    rows=await request<any[]>(queryPath('/github/repos',{page}))
    // #endif
    // #ifndef MP-WEIXIN
    rows=await externalRequest('https://api.github.com/users/'+encodeURIComponent(username)+'/repos?sort=pushed&per_page=100&page='+page,null,token)
    // #endif
    repos.push(...rows)
    if(rows.length<100)return repos
  }
}
export function fetchRepoContributors(fullName:string,token='') {
  // #ifdef MP-WEIXIN
  return request<any[]>(queryPath('/github/repository/contributors',{name:fullName.split('/')[1]}))
  // #endif
  // #ifndef MP-WEIXIN
  return externalRequest('https://api.github.com/repos/'+fullName.split('/').map(encodeURIComponent).join('/')+'/contributors?per_page=100',null,token)
  // #endif
}
export function fetchRepoInfo(fullName:string,token='') {
  // #ifdef MP-WEIXIN
  return request<any>(queryPath('/github/repository/info',{name:fullName.split('/')[1]}))
  // #endif
  // #ifndef MP-WEIXIN
  return externalRequest('https://api.github.com/repos/'+fullName.split('/').map(encodeURIComponent).join('/'),null,token)
  // #endif
}
export function fetchGithubCalendar(username:string,token:string) {
  // #ifdef MP-WEIXIN
  return request<any>('/github/calendar')
  // #endif
  // #ifndef MP-WEIXIN
  return externalRequest('https://api.github.com/graphql',{query:'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date contributionLevel}}}}}}',variables:{login:username}},token)
  // #endif
}
function leetcode(section:string,query:string,variables:Record<string,any>={},noj=false){
  // #ifdef MP-WEIXIN
  return request<any>('/leetcode/data/'+section)
  // #endif
  // #ifndef MP-WEIXIN
  let base='https://leetcode.cn'
  // #ifdef WEB
  base='/leetcode-api'
  // #endif
  return externalRequest(base+'/graphql'+(noj?'/noj-go/':''),{query,variables}).then(data=>data.data)
  // #endif
}
export const fetchLeetcodeProfile=(username:string)=>leetcode('profile','query($userSlug:String!){userProfilePublicProfile(userSlug:$userSlug){siteRanking profile{reputation countryName}} userProfileUserQuestionProgress(userSlug:$userSlug){numAcceptedQuestions{difficulty count} numFailedQuestions{difficulty count} numUntouchedQuestions{difficulty count}}}',{userSlug:username})
export const fetchLeetcodeContest=(username:string)=>leetcode('contest','query($userSlug:String!){userContestRanking(userSlug:$userSlug){attendedContestsCount rating globalRanking localRanking globalTotalParticipants localTotalParticipants topPercentage}}',{userSlug:username},true)
export const fetchLeetcodeCalendar=(username:string)=>leetcode('calendar','query($userSlug:String!){userCalendar(userSlug:$userSlug){streak totalActiveDays submissionCalendar activeYears recentStreak}}',{userSlug:username},true)
export const fetchLeetcodeDaily=()=>leetcode('daily','query{todayRecord{date userStatus question{title titleSlug translatedTitle}}}')
export const fetchLeetcodeRecent=(username:string)=>leetcode('recent','query($userSlug:String!){recentACSubmissions(userSlug:$userSlug){submissionId submitTime question{title translatedTitle titleSlug questionFrontendId}}}',{userSlug:username},true)
export function openExternal(url:string){if(!/^https:\/\//.test(url))throw new Error('链接无效')
  // #ifdef WEB
  window.open(url,'_blank','noopener,noreferrer')
  // #endif
  // #ifdef APP
  plus.runtime.openURL(url)
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({data:url})
  // #endif
}
export function calendarSummary(days:{date:string,count:number}[],today:string){const sorted=days.filter(day=>day.date<=today).sort((a,b)=>a.date.localeCompare(b.date));let streak=0;for(let i=sorted.length-1;i>=0;i--){if(sorted[i].count>0)streak++;else if(sorted[i].date!==today)break}return{today:sorted.find(day=>day.date===today)?.count||0,streak,total:sorted.reduce((n,day)=>n+day.count,0),active:sorted.filter(day=>day.count>0).length}}
