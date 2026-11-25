import { pickQuery } from './api-payload.ts'
export function queryPath(path: string, params: Record<string, any> = {}) {
  const entries = Object.entries(pickQuery(path, params)).flatMap(([key, value]) => {
    const values = Array.isArray(value) ? value : [value]
    return values.filter(item => item != null && item !== '')
      .map(item => encodeURIComponent(key) + '=' + encodeURIComponent(String(item)))
  })
  return path + (entries.length ? '?' + entries.join('&') : '')
}
