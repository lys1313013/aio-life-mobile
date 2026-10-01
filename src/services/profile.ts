import { request } from './api.ts'
import { bindingPayload, readBindings } from './profile-contract.ts'

export async function loadBindings() {
  return readBindings(await request('/userbinds/list'))
}
export async function saveBinding(form) {
  const payload = bindingPayload(form)
  const result = await request('/userbinds', form.id ? 'PUT' : 'POST', payload)
  if (result !== true) throw new Error('绑定未保存，请重试')
}
export async function removeBinding(id: string) {
  const result = await request('/userbinds/' + encodeURIComponent(id), 'DELETE')
  if (result !== true) throw new Error('解绑未完成，请重试')
}
export function verifyDouban(accountId: string) {
  return request<{ nickname: string }>(
    '/userbinds/douban/verify?accountId=' + encodeURIComponent(accountId.trim())
  )
}
