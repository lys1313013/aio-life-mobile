import { missingRequired } from './form-required.ts';
export const platforms = [
  { value: 'github', label: 'GitHub', mark: 'G', hint: '填写 GitHub 用户名。' },
  {
    value: 'leetcode',
    label: 'LeetCode',
    mark: 'L',
    hint: '填写 leetcode.cn/u/ 后的用户名。'
  },
  {
    value: 'csdn',
    label: 'CSDN',
    mark: 'C',
    hint: '填写 blog.csdn.net/ 后的用户名。'
  },
  {
    value: 'shanbay',
    label: '扇贝单词',
    mark: '扇',
    hint: '填写扇贝个人主页 /user/ 后的用户 ID。'
  },
  {
    value: 'douban',
    label: '豆瓣',
    mark: '豆',
    hint: '填写个人主页 /people/ 后的账号 ID，不是昵称或完整网址。'
  },
  {
    value: 'weread',
    label: '微信读书',
    mark: '读',
    hint: '在微信读书官方授权页获取 API Key：weread.qq.com/r/weread-skills'
  }
]
export function platformInfo(value) {
  return (
    platforms.find((item) => item.value === value) || {
      value,
      label: value,
      mark: '链',
      hint: ''
    }
  )
}
export function readBindings(data) {
  if (
    !Array.isArray(data) ||
    data.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        !item.id ||
        typeof item.platform !== 'string'
    )
  )
    throw new Error('绑定信息异常，请重试')
  // 凭证与同步元数据不进入编辑表单或持久存储。
  return data.map((item) => ({
    id: item.id,
    platform: item.platform,
    platformUsername:
      typeof item.platformUsername === 'string' ? item.platformUsername : ''
  }))
}
export function bindingPayload(form) {
  if (!platforms.some((item) => item.value === form.platform))
    throw new Error('请选择支持的平台')
  const username = form.platformUsername.trim()
  const credential = form.accessToken.trim()
  if (missingRequired('binding', form, 'platformUsername'))
    throw new Error('请输入账号或用户名')
  if (missingRequired('binding', form, 'accessToken'))
    throw new Error('请输入微信读书 API Key')
  if (form.id && typeof form.id !== 'string') throw new Error('绑定 ID 异常')
  return {
    ...(form.id ? { id: form.id } : {}),
    platform: form.platform,
    platformUsername: form.platform === 'weread' ? '' : username,
    ...(['github', 'weread'].includes(form.platform) && credential ? { accessToken: credential } : {})
  }
}
