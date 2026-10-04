import { withFormRequired } from './helpers/form-required-source.mjs';
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
const asModule = text => `data:text/javascript;base64,${Buffer.from(withFormRequired(text)).toString('base64')}`
const source = await readFile(new URL('../src/services/admin/contract.ts',import.meta.url),'utf8')
const specsSource = await readFile(new URL('../src/pages/admin/services/specs.ts',import.meta.url),'utf8')
const { stringId, queryPath, readPage, categoryPayload, siblingSort, flattenMenus, protectedMenu, validateConfig, orderCategories } = await import(asModule(source))
const { adminPayload } = await import(asModule(specsSource))
const id = '9223372036854775807'
test('管理员所有分页和路径保留长ID，数字ID拒绝；条件平铺编码',() => {
 assert.equal(stringId(id),id); assert.throws(()=>stringId(123),/ID/)
 assert.deepEqual(readPage({items:[{dictCode:id}],total:1},'dictCode'),{items:[{dictCode:id}],total:1})
 assert.throws(()=>readPage({items:[{id:123}],total:1}),/ID/)
 assert.equal(queryPath('/query',{keyword:'a&b',page:1,empty:''}),'/query?keyword=a%26b&page=1')
})
test('管理分页兼容后端Long字符串总数，空页有效且长ID保持原样', () => {
 const page = {items:[{id}],total:'21'}
 assert.deepEqual(readPage(page), {items:[{id}],total:21})
 assert.equal(page.total, '21')
 assert.deepEqual(readPage({items:[],total:'0'}), {items:[],total:0})
 assert.deepEqual(readPage({items:[{dictCode:id}],total:'1'}, 'dictCode'), {items:[{dictCode:id}],total:1})
 for (const total of [null, undefined, '', ' ', 'abc', '-1', '1.5', '1e2', true, {}, [], -1, 1.5, NaN, Infinity, '9007199254740992', 9007199254740992]) {
  assert.throws(() => readPage({items:[],total}), /列表数据异常/)
 }
})
test('公共分类覆盖使用模板ID且未改父级不发送，未知和用户字段不泄露',() => {
 const original={id:'3',templateId:id,parentId:null,userId:'7'}
 const form={...original,parentId:'0',name:' 分类 ',color:'#123456',icon:'lucide:book',isTrackTime:1,timeType:2,clientOnly:true}
 const result=categoryPayload(form,original)
 assert.equal(result.id,id); assert.equal(result.templateId,id); assert.equal(result.name,'分类'); assert.equal(result.icon,'lucide:book'); assert.equal(result.timeType,2)
 assert.equal('parentId' in result,false); assert.equal('userId' in result,false); assert.equal('clientOnly' in result,false)
 assert.throws(()=>categoryPayload({...form,color:'red'},original),/颜色/)
})
test('排序只在同级交换，公共模板映射保留；树顺序父在子前',() => {
 const rows=[{id:'1',parentId:'0',sort:0,userId:'0'},{id:'2',parentId:'0',sort:10,userId:'7'},{id:'3',parentId:'1',sort:0,userId:'7'}]
 assert.deepEqual(siblingSort(rows,rows[0],1),[{id:'2',templateId:null,sort:0},{id:'1',templateId:'1',sort:10}])
 assert.deepEqual(siblingSort(rows,rows[2],1),[])
 assert.deepEqual(orderCategories(rows).map(row=>row.id),['1','3','2'])
})
test('菜单保留额外meta，核心管理强制启用且不许改路径',() => {
 const original={id,path:'/system/menu'}
 const result=adminPayload('menus',{title:'菜单',name:'Menu',path:'/system/menu',parentId:'0',status:'0',metaText:'{"keepAlive":true}'},original)
 assert.deepEqual(result.meta,{keepAlive:true,title:'菜单',icon:undefined}); assert.equal(result.status,1); assert.equal(result.id,id)
 assert.throws(()=>adminPayload('menus',{title:'菜单',name:'Menu',path:'/other',parentId:'0',status:'1',metaText:'{}'},original),/不可修改/)
 assert.equal(protectedMenu(original),true)
 assert.deepEqual(flattenMenus([{id:'1',children:[{id:'2'}]}]).map(row=>row.depth),[0,1])
})
test('基础字典禁止改用户私有值，配置严格JSON与数字',() => {
 assert.throws(()=>adminPayload('user-dict',{dictType:'exercise',dictLabel:'跑步',status:'0'},{id,userId:'99'}),/基础值/)
 assert.equal(validateConfig({configType:'JSON'},'["'+id+'"]'),'["'+id+'"]')
 assert.throws(()=>validateConfig({configType:'JSON'},'broken'))
 assert.throws(()=>validateConfig({configType:'NUMBER'},''),/数字/)
})

test('管理员CRUD与个人/公共分类接口分离，不将长ID转number',async()=>{
 const calls=[]
 globalThis.__adminMock=(...args)=>{calls.push(args); return Promise.resolve(true)}
 const serviceSource=await readFile(new URL('../src/pages/admin/services/index.ts',import.meta.url),'utf8')
 const service=await import(asModule(serviceSource.replace("import { request } from '../../../services/api.ts'","const request = globalThis.__adminMock").replace("from './specs.ts'","from '"+asModule(specsSource)+"'").replace("from '../../../services/admin/contract.ts'","from '"+asModule(source)+"'")))
 await service.saveAdmin('users',{username:'demo',nickname:'演示',role:'user'},{id})
 assert.equal(calls.at(-1)[0],'/user-center'); assert.equal(calls.at(-1)[1],'PUT'); assert.equal(calls.at(-1)[2].id,id)
 await service.deleteAdmin('dict-types',{dictId:id})
 assert.deepEqual(calls.at(-1),['/sysDictType/'+id,'DELETE'])
 await service.batchCloseFeedback([id])
 assert.deepEqual(calls.at(-1),['/feedback/admin/batch','POST',{idList:[id],action:'CLOSE'}])
 const categoriesSource=await readFile(new URL('../src/pages/categories/services/categories.ts',import.meta.url),'utf8')
 const categories=await import(asModule(categoriesSource.replace("import { request } from '../../../services/api.ts'","const request = globalThis.__adminMock").replace("from '../../../services/admin/contract.ts'","from '"+asModule(source)+"'")))
 await categories.changeCategory({id,templateId:'9',userId:'4'},{isEnabled:0},false)
 assert.deepEqual(calls.at(-1),['/timeTrackerCategory','PUT',{id:'9',templateId:'9',isEnabled:0}])
 await categories.deleteCategory({id},true)
 assert.deepEqual(calls.at(-1),['/timeTrackerCategory/admin/'+id,'DELETE'])
 delete globalThis.__adminMock
})

test('菜单可保存主页负数排序，字典仍禁止负数', () => {
 const form={title:'主页',name:'Home',path:'/',parentId:'0',status:'1',sort:'-1',metaText:'{}'}
 assert.equal(adminPayload('menus',form).sort,-1)
 assert.throws(()=>adminPayload('dict-data',{dictId:'1',dictValue:'v',dictLabel:'名称',dictSort:'-1'}),/非负/)
})


test('菜单图标颜色作为独立字段保存、清空并校验，不写入meta', () => {
 const form = {title:'菜单',name:'Menu',path:'/sample',parentId:'0',status:'1',metaText:'{"keepAlive":true}',iconColor:' #427bea '}
 const saved = adminPayload('menus', form)
 assert.equal(saved.iconColor, '#427bea')
 assert.equal(saved.meta.iconColor, undefined)
 assert.equal(adminPayload('menus', {...form,iconColor:''}).iconColor, '')
 assert.throws(() => adminPayload('menus', {...form,iconColor:'red'}), /六位颜色/)
})

test('菜单分端状态保留零值并通过独立接口切换，不改变另一端', async () => {
 const payload = adminPayload('menus', {title:'菜单',name:'Menu',path:'/sample',parentId:'0',status:'1',mobileStatus:'0',metaText:'{}'})
 assert.equal(payload.status, 1); assert.equal(payload.mobileStatus, 0)
 assert.throws(() => adminPayload('menus', {title:'菜单',name:'Menu',path:'/sample',parentId:'0',status:'1',mobileStatus:'2',metaText:'{}'}), /只能/)
 const calls=[]
 globalThis.__menuStatusMock=(...args)=>{calls.push(args); return Promise.resolve(true)}
 const serviceSource=await readFile(new URL('../src/pages/admin/services/index.ts',import.meta.url),'utf8')
 const service=await import(asModule(serviceSource.replace("import { request } from '../../../services/api.ts'","const request = globalThis.__menuStatusMock").replace("from './specs.ts'","from '"+asModule(specsSource)+"'").replace("from '../../../services/admin/contract.ts'","from '"+asModule(source)+"'")))
 const row={id,path:'/sample',status:1,mobileStatus:0}
 await service.setMenuStatus(row,true)
 assert.deepEqual(calls.at(-1), ['/menu/admin/'+id+'/mobile-status','PUT',{status:1}])
 await service.setMenuStatus(row)
 assert.deepEqual(calls.at(-1), ['/menu/admin/'+id+'/status','PUT',{status:0}])
 assert.deepEqual(row,{id,path:'/sample',status:1,mobileStatus:0})
})
