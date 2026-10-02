import { missingRequired } from '../form-required.ts';
export function entityId(value) { if(typeof value !== 'string' || !/^\d+$/.test(value)) throw Error('记录ID异常，请重试'); return value }
export function safeExternalUrl(value) {if(typeof value !== 'string' || !/^https:\/\/[^\s\\]+$/i.test(value)) throw Error('外部地址无效'); return value}
export function objectValue(value) {if(typeof value === 'string') {try{return JSON.parse(value)}catch{return value}}; return value}
export function mbtiPayload(testId,result) {
  if(!testId || !result?.mbtiType) throw Error('测试结果未完成')
  const data={testId,mbtiType:result.mbtiType}
  for(const key of ['predictions','traitOrderConscious','traitOrderShadow','matches','resultsPage']) if(result[key] != null) data[key]=objectValue(result[key])
  return data
}
export function cbtiPayload(questions,answers,hiddenAnswers) {
  if(!Array.isArray(questions) || !questions.length) throw Error('题目未加载完成')
  const normalized={}
  for(const question of questions) {const value=answers[question.id]; if(!question.options.some(option=>option.value === value)) throw Error('请完成第'+question.id+'题'); normalized[question.id]=value}
  if(!hiddenAnswers?.drink) throw Error('请选择饮品')
  const hidden={drink:hiddenAnswers.drink}
  if(hidden.drink === 'coffee') {if(!hiddenAnswers.drinkAttitude) throw Error('请选择咖啡态度'); hidden.drinkAttitude=hiddenAnswers.drinkAttitude}
  return {answers:normalized,hiddenAnswers:hidden}
}
export function vectorValue(value) {
  const vector=typeof value === 'string' ? JSON.parse(value) : value
  if(!Array.isArray(vector) || vector.length !== 15 || vector.some(value=>typeof value !== 'number' || ![0,1,2].includes(value))) throw Error('向量需要15项，每项只能为0/1/2（低/中/高）')
  return [...vector]
}
export function personalityPayload(form) {
  if(missingRequired('personality', form, 'code') || missingRequired('personality', form, 'name')) throw Error('请输入人格代码和名称')
  if(form.color && !/^#([\da-fA-F]{3}|[\da-fA-F]{6})$/.test(form.color)) throw Error('颜色必须为十六进制格式')
  const result={code:form.code.trim(),name:form.name.trim(),vector:vectorValue(form.vector),isSpecial:!!form.isSpecial}
  for(const key of ['motto','color','description','techStack','spirit','imageObject']) if(form[key] != null) result[key]=form[key]
  for(const key of ['strengths','weaknesses']) result[key]=Array.isArray(form[key]) ? form[key] : String(form[key] || '').split('\n').map(line=>line.trim()).filter(Boolean)
  return result
}
export function authPayload(mode,form) {
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) throw Error('请输入有效邮箱')
  if(!form.code.trim()) throw Error('请输入验证码')
  if(!form.password) throw Error('请输入密码')
  if(form.password !== form.confirmPassword) throw Error('两次密码不一致')
  const result={email:form.email.trim(),code:form.code.trim(),password:form.password}
  if(mode === 'register') {if(!form.username.trim()) throw Error('请输入用户名'); result.username=form.username.trim()}
  return result
}
export function shareText(result,site='') { const p=result.personality; return '我在 CBTI 程序员人格测试中测出了【'+p.code+' · '+p.name+'】！\n「'+(p.motto || '')+'」\n匹配度 '+result.similarity+'%'+(site ? '\n'+site : '') }

export function cbtiResult(data) {
 if(!data || !data.personality || typeof data.personality.code !== 'string' || typeof data.personality.name !== 'string' || !Array.isArray(data.dimensions) || typeof data.similarity !== 'number') throw Error('人格结果数据异常，请重试')
 return data
}
