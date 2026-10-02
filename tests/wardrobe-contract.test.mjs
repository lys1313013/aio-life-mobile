import { withFormRequired } from './helpers/form-required-source.mjs';
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
const source=await readFile(new URL('../src/pages/goods/services/wardrobe/contract.ts',import.meta.url),'utf8')
const {id,itemPayload,categoryPayload,flattenCategories,matchesItem}=await import('data:text/javascript;base64,'+Buffer.from(withFormRequired(source)).toString('base64'))
const form={name:' 冬衣 ',categoryId:'9223372036854775807',color:'白',brand:'A',season:['冬'],purchaseDate:'2026-01-01',price:'99.50',fileId:'9223372036854775806',size:'M',memo:'保留备注'}
test('衣物提交长ID与完整字段，季节数组、价格数字，负价拒绝',()=>{assert.deepEqual(itemPayload(form),{...form,name:'冬衣',price:99.5});assert.throws(()=>itemPayload({...form,price:'-1'}));assert.throws(()=>itemPayload({...form,season:['未知']}));assert.throws(()=>id(123))})
test('分类树、系统预设保护、自身父级保护与名称校验',()=>{assert.equal(flattenCategories([{id:'1',children:[{id:'2'}]}])[1].depth,1);assert.throws(()=>categoryPayload({name:'a',sort:0},{categoryType:0}));assert.throws(()=>categoryPayload({name:'a',sort:0,parentId:'2'},{id:'2'}));assert.equal(categoryPayload({name:' 分类 ',sort:'2',parentId:'1',icon:'icon'}).parentId,'1')})
test('名称颜色品牌搜索、分类/季节联合筛选',()=>{assert.equal(matchesItem({...form,season:'秋,冬'},'白',form.categoryId,'冬'),true);assert.equal(matchesItem({...form,season:'冬'},'白',form.categoryId,'夏'),false)})
