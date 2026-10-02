import { pickQuery } from './api-payload.ts'
export function queryPath(path: string, params: Record<string, any> = {}) {
  const entries = Object.entries(pickQuery(path, params)).filter(([, value]) => value != null && value !== '')
  return path + (entries.length ? '?' + entries.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&') : '')
}
