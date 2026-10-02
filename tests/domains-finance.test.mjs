import { withFormRequired } from './helpers/form-required-source.mjs';
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
async function load(path) { const source=await readFile(new URL(path,import.meta.url),'utf8');const {code}=await transform(source.replace(/^import .*session-guard.ts'\n/m,'const request = (...args) => args\n').replaceAll("'../../../services/query-path.ts'", JSON.stringify(queryUrl)),{loader:'ts',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(withFormRequired(code)).toString('base64')) }
const payloadSource = await readFile(new URL('../src/services/api-payload.ts', import.meta.url), 'utf8')
const payloadCode = (await transform(payloadSource, {loader:'ts',format:'esm'})).code
const payloadUrl = 'data:text/javascript;base64,' + Buffer.from(payloadCode).toString('base64')
const querySource = await readFile(new URL('../src/services/query-path.ts', import.meta.url), 'utf8')
const queryCode = (await transform(querySource.replace("'./api-payload.ts'", JSON.stringify(payloadUrl)), {loader:'ts',format:'esm'})).code
const queryUrl = 'data:text/javascript;base64,' + Buffer.from(queryCode).toString('base64')
const finance=await load('../src/pages/finance/services/finance.ts')
test('财务 GET 条件平铺且保留字符串大 ID',()=>{const id='9223372036854775807';assert.equal(finance.ledgerId({id}),id);assert.equal(finance.ledgerId({incomeId:id}),id);assert.equal(finance.queryPath('/income/query',{page:1,pageSize:50,incTypeId:id,year:'',startTime:'2026-10-01'}),'/income/query?page=1&pageSize=50&incTypeId='+id+'&startTime=2026-10-01')})
test('收入更新使用真实 id，保留税与关联数据',async()=>{const id='9223372036854775807',draft={id,amt:'100',incDate:'2026-10-01',tax:3,remark:'fixture'};const result=await finance.saveLedger('income',draft);assert.equal(result[0],'/income/'+id);assert.equal(result[1],'PUT');assert.equal(result[2].tax,3);assert.equal(result[2].id,id)})
test('支出更新保留导入明细，非法金额拒绝提交',async()=>{const row={id:'9',amt:'26.4',transactionAmt:'99',expTypeId:'1',payTypeId:'2',expTime:'2026-10-01 01:02:00',transactionId:'fixture-order',successfulRefund:72.6};const args=await finance.saveLedger('expense',row);assert.equal(args[0],'/expense');assert.equal(args[2].transactionId,row.transactionId);assert.throws(()=>finance.ledgerPayload('expense',{...row,amt:'bad'}),/有效金额/);assert.throws(()=>finance.ledgerPayload('expense',{...row,payTypeId:''}),/请选择/);assert.deepEqual(finance.deleteExpenses(['9'])[2],{idList:['9']})})
