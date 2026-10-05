// #ifdef WEB
import engineUrl from 'virtual:aio-chart-runtime'
// #endif
let pending: Promise<any> | null = null
let retries = 0

// Keep the engine out of the WeChat main package. A rejected load can be retried.
export function loadChartEngine(): Promise<any> {
  if (!pending) {
    // #ifdef MP-WEIXIN
    pending = require.async('../chart-runtime/echarts.js')
    // #endif
    // #ifdef WEB
    const url = engineUrl + (retries ? '?retry=' + retries : '')
    retries++
    pending = import(/* @vite-ignore */ url)
    // #endif
    // #ifdef APP
    pending = import('./chart-engine-runtime.ts')
    // #endif
    pending = pending!.catch(error => { pending = null; throw error })
  }
  return pending!
}
