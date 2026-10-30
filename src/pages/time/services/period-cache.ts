import { periodRange } from '../../../services/time-format.ts'
import type { TimeRecord } from '../../../services/dashboard.ts'

/** 只保留邻近周期；刷新、编辑、账号变化和离页均使未完成的预取失效。 */
export function createPeriodCache(fetchRecords: (date: string, mode: string) => Promise<TimeRecord[]>) {
  const values = new Map<string, TimeRecord[]>()
  const pending = new Map<string, Promise<TimeRecord[]>>()
  let generation = 0
  const key = (date: string, mode: string) => mode + ':' + periodRange(date, mode).start
  function read(date: string, mode: string) { return values.get(key(date, mode)) }
  function get(date: string, mode: string) {
    const id = key(date, mode)
    if (values.has(id)) return Promise.resolve(values.get(id)!)
    if (pending.has(id)) return pending.get(id)!
    const version = generation
    const request = fetchRecords(date, mode).then(records => {
      if (version === generation) {
        values.set(id, records)
        if (values.size > 5) values.delete(values.keys().next().value!)
      }
      return records
    }).finally(() => { if (version === generation) pending.delete(id) })
    pending.set(id, request)
    return request
  }
  function clear() { generation++; values.clear(); pending.clear() }
  function set(date: string, mode: string, records: TimeRecord[]) { values.set(key(date, mode), records) }
  return { read, get, set, clear }
}
