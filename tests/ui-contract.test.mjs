import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
const spacing = await readFile(new URL('../src/styles/spacing.json', import.meta.url), 'utf8')
const source = (await readFile(new URL('../src/services/mobile-ui.ts', import.meta.url), 'utf8')).replace("import spacing from '../styles/spacing.json'", `const spacing = ${spacing}`)
const { createLatestTask, createAsyncAction, pickerValue, modalAvailableHeight, chartGeometry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('日期切换与离页使旧请求失效，保留最新请求', () => {
  const task = createLatestTask()
  const old = task.begin()
  const current = task.begin()
  assert.equal(task.isCurrent(old), false)
  assert.equal(task.isCurrent(current), true)
  task.invalidate()
  assert.equal(task.isCurrent(current), false)
  assert.equal(task.isCurrent(task.begin()), true)
})
test('异步重复点击只执行一次，等待期间 loading，完成可再次操作', async () => {
  const operation = createAsyncAction()
  let finish
  const first = operation.run(() => new Promise(resolve => { finish = resolve }))
  assert.equal(operation.state.loading, true)
  assert.deepEqual(await operation.run(() => { throw Error('不应执行') }), { executed: false })
  finish('ok')
  assert.deepEqual(await first, { executed: true, value: 'ok' })
  assert.equal(operation.state.loading, false)
})
test('失败释放 loading 并允许重试，不改动原表单', async () => {
  const operation = createAsyncAction()
  const form = { title: '未保存', id: '9223372036854775807' }
  await assert.rejects(operation.run(async () => { throw Error('网络错误') }), /网络错误/)
  assert.equal(operation.state.error, '网络错误')
  assert.equal(operation.state.loading, false)
  assert.deepEqual(form, { title: '未保存', id: '9223372036854775807' })
  await operation.run(async () => 'success')
  assert.equal(operation.state.error, '')
})
test('原生 picker 输出字符串；键盘与安全区扣减滚动高度', () => {
  assert.equal(pickerValue('selector', 1, ['全部', '有效']), '有效')
  assert.equal(pickerValue('date', '2026-10-01'), '2026-10-01')
  assert.equal(pickerValue('selector', 99, ['全部']), '')
  assert.equal(modalAvailableHeight(800, 300, 44, 34), 374)
  assert.equal(modalAvailableHeight(200, 180, 44, 34), 80)
})

test('公共图表保留负值和零基线，支持单点，不默默归零非法数据',()=>{
 const chart=chartGeometry(['一月','二月'],[{name:'结余',values:[-20,40]}],300,180)
 assert.equal(chart.min,-20);assert.equal(chart.max,40);assert.equal(chart.zero,120)
 assert.deepEqual(chart.series[0].points,[{x:0,y:180,value:-20},{x:300,y:0,value:40}]);assert.equal(chart.series[0].segments.length,1)
 assert.equal(chartGeometry(['一月'],[{name:'收入',values:[0]}],300).series[0].points[0].x,150)
 assert.throws(()=>chartGeometry(['一月'],[{name:'收入',values:[1,2]}],300),/不一致/)
 assert.throws(()=>chartGeometry(['一月'],[{name:'收入',values:[NaN]}],300),/不一致/)
})
