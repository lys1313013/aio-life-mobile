export function flattenMenuOptions(nodes, parents = [], parentHidden = false, hiddenIds = []) {
  if (!Array.isArray(nodes)) throw new Error('菜单数据异常')
  return nodes.flatMap(node => {
    if (typeof node.id !== 'string') throw new Error('菜单 ID 数据异常')
    const titles = [...parents, node.title]
    const hidden = parentHidden || hiddenIds.includes(node.id)
    return node.children?.length
      ? flattenMenuOptions(node.children, titles, hidden, hiddenIds)
      : [{ id: node.id, title: titles.join(' / '), hidden }]
  })
}
export function passwordPayload(form) {
  if (!form.oldPassword || !form.password) throw new Error('请填写旧密码和新密码')
  if (form.password !== form.confirm) throw new Error('两次输入的密码不一致')
  return { oldPassword: form.oldPassword, newPassword: form.password }
}
export function llmPayload(form) {
  if (!form.modelName.trim() || !form.baseUrl.trim()) throw new Error('请填写模型名称和接口地址')
  if (!/^https?:\/\//.test(form.baseUrl.trim())) throw new Error('接口地址须以 http:// 或 https:// 开头')
  if (!form.id && !form.apiKey.trim()) throw new Error('请输入 API Key')
  const result = { modelName: form.modelName.trim(), baseUrl: form.baseUrl.trim(), isDefault: form.isDefault ? 1 : 0 }
  if (form.id) result.id = form.id
  if (form.apiKey.trim()) result.apiKey = form.apiKey.trim()
  return result
}
export function notificationPayload(items) {
  return { items: items.flatMap(({ bizType, channels }) => channels.map(({ channel, enabled }) => ({ bizType, channel, enabled: !!enabled }))) }
}
