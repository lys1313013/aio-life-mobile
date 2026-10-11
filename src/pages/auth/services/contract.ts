export function authPayload(mode,form) {
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) throw Error('请输入有效邮箱')
  if(!form.code.trim()) throw Error('请输入验证码')
  if(!form.password) throw Error('请输入密码')
  if(form.password !== form.confirmPassword) throw Error('两次密码不一致')
  const result={email:form.email.trim(),code:form.code.trim(),password:form.password}
  if(mode === 'register') {if(!form.username.trim()) throw Error('请输入用户名'); result.username=form.username.trim()}
  return result
}
