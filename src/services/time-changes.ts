import type { TimeRecord } from './dashboard.ts'
import { session } from './session.ts'

let pending: {
  token: string
  record: TimeRecord | null
  deletedId: string
} | null = null
export function recordChanged(record: TimeRecord | null, deletedId = '') {
  pending = { token: session.token, record, deletedId }
}
export function takeRecordChange() {
  const change = pending
  pending = null
  return change?.token === session.token ? change : null
}
