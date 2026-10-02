const field = (key, label, required = false, kind = 'text', options = []) => ({ key, label, required, kind, options })
const option = (label, value) => ({ label, value })
const status = [option('启用','0'),option('禁用','1')]
export const feedbackStatuses = [option('待处理','PENDING'),option('处理中','PROCESSING'),option('已解决','RESOLVED'),option('已关闭','CLOSED'),option('已驳回','REJECTED')]
export const feedbackTypes = [option('缺陷','BUG'),option('建议','SUGGESTION'),option('咨询','QUESTION'),option('其他','OTHER')]
export const specs = {
  users: { title: '用户中心', query: '/user-center/list', base: '/user-center', id: 'id', updateRoot: true, search: 'keyword', fields: [field('username','用户名',true), field('nickname','昵称',true), field('role','角色',true,'selector',[option('管理员','admin'),option('普通用户','user')]),field('email','邮箱')], display: ['username','nickname','role','email','isOnline','lastActiveTime','createTime'] },
  'dict-types': { title:'字典类型', query:'/sysDictType/query', base:'/sysDictType', id:'dictId', search:'dictName', fields:[field('dictName','字典名称',true),field('dictType','字典标识',true),field('remark','备注',false,'textarea')], display:['dictName','dictType','remark','updateTime'] },
  'dict-data': { title:'字典数据', query:'/sysDictData/query', base:'/sysDictData', id:'dictCode', search:'dictLabel', fields:[field('dictId','字典类型',true,'selector'),field('dictValue','实际值',true),field('dictLabel','展示值',true),field('dictSort','排序',false,'number'),field('remark','备注',false,'textarea')], display:['dictLabel','dictValue','dictName','dictType','dictSort','status','remark','updateTime'] },
  'user-dict': { title:'用户字典管理', query:'/userDictData/admin/query', base:'/userDictData/admin', id:'id', search:'dictLabel', fields:[field('dictType','字典类型',true,'selector'),field('dictLabel','字典名称',true),field('color','颜色'),field('icon','图标'),field('dictSort','排序',false,'number'),field('status','状态',true,'selector',status),field('isReadonly','只读',false,'selector',[option('是','Y'),option('否','N')])], display:['dictLabel','dictType','dictSort','status','isReadonly','color','icon'] },
  menus: { title:'菜单管理', query:'/menu/admin/tree', base:'/menu/admin', id:'id', tree:true, search:'name', fields:[field('title','菜单名称',true),field('name','路由名称',true),field('parentId','父菜单',true,'selector'),field('path','路由',true),field('component','前端组件'),field('redirect','重定向'),field('icon','菜单图标'),field('roles','角色（逗号分隔）'),field('sort','排序',false,'number'),field('status','启用状态',true,'selector',[option('启用','1'),option('停用','0')]),field('metaText','其他菜单属性',false,'textarea')], display:['title','name','path','component','roles','sort','status'] },
  config: { title:'系统配置', query:'/system-config/list', base:'/system-config', id:'configKey', array:true, search:'keyPrefix', fields:[], display:['description','configKey','configType','configValue','updateTime'] },
  feedback: { title:'反馈管理', query:'/feedback/admin/list', base:'/feedback/admin', id:'id', search:'keyword', readOnly:true, fields:[], display:['title','userName','feedbackType','status','priority','commentCount','createTime'] },
  operation: { title:'操作日志', query:'/system/logs/operation', id:'id', search:'username', readOnly:true, fields:[], display:['functionName','functionItem','username','nickname','success','ipAddress','browser','createTime'] },
  access: { title:'访问日志', query:'/system/logs/access', id:'id', search:'username', readOnly:true, fields:[], display:['functionName','functionItem','username','nickname','accessType','ipAddress','browser','createTime'] },
}
export function adminPayload(kind, form, original = null) {
  const spec = specs[kind]
  if (!spec) throw Error('管理类型无效')
  const result = {}
  for (const item of spec.fields) {
    const value = form[item.key]
    if (item.required && (value == null || String(value).trim() === '')) throw Error('请输入' + item.label)
    if (item.kind === 'number' && value != null && String(value) !== '') {
      if (!Number.isFinite(Number(value)) || (kind !== 'menus' && Number(value) < 0)) throw Error(item.label + (kind === 'menus' ? '必须为数字' : '必须为非负数字'))
      result[item.key] = Number(value)
    } else if (value != null) result[item.key] = String(value).trim()
  }
  if (original) result[spec.id] = original[spec.id]
  if (kind === 'menus') {
    const meta = JSON.parse(result.metaText || '{}')
    if (!meta || Array.isArray(meta) || typeof meta !== 'object') throw Error('菜单属性必须为 JSON 对象')
    meta.title = result.title; meta.icon = result.icon
    result.meta = meta
    delete result.metaText; delete result.title; delete result.icon
    if (original && ['/system','/system/menu'].includes(original.path) && result.path !== original.path) throw Error('核心管理菜单路由不可修改')
    if (['/system','/system/menu'].includes(result.path)) result.status = 1
    result.status = Number(result.status)
  }
  if (kind === 'user-dict' && original && original.userId !== '0') throw Error('只能编辑基础值')
  return result
}
