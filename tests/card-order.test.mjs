import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/services/card-order.ts', import.meta.url), 'utf8')
const { compareCardOrder, previewCardMove, applyCardOrder } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const rows = ['9007199254740993', '9007199254740994', '9007199254740995', '9007199254740996'].map((id, i) => ({ id, sortOrder: i * 10, name: '卡' + i }))
test('长ID同序号按后端方向排序，不损失精度', () => {
  const tied = rows.map(row => ({ ...row, sortOrder: 0 }))
  assert.deepEqual([...tied].sort((a, b) => compareCardOrder(a, b, true)).map(row => row.id), rows.map(row => row.id).reverse())
  assert.deepEqual([...tied].reverse().sort(compareCardOrder).map(row => row.id), rows.map(row => row.id))
})
test('筛选后以目标卡片定位，隐藏项的相对顺序不变', () => {
  const result = previewCardMove(rows, { id: rows[0].id, targetId: rows[2].id, after: true })
  assert.deepEqual(result.map(row => row.id), [rows[1].id, rows[2].id, rows[0].id, rows[3].id])
  assert.deepEqual(rows.map(row => row.sortOrder), [0, 10, 20, 30])
  assert.deepEqual(applyCardOrder(result, rows).sort(compareCardOrder), rows)
})
test('服务端排序只修改序号，不覆盖其他字段且不插入未加载卡片', () => {
  const result = applyCardOrder(rows, [{ id: rows[0].id, sortOrder: 9 }, { id: '1', sortOrder: 0 }])
  assert.equal(result.length, rows.length)
  assert.equal(result[0].name, rows[0].name)
  assert.equal(result[0].sortOrder, 9)
  assert.throws(() => applyCardOrder(rows, [{ id: Number(rows[0].id), sortOrder: 0 }]), /异常/)
  assert.throws(() => applyCardOrder(rows, [{ id: rows[0].id, sortOrder: -1 }]), /异常/)
})

test('排序保存中不重复请求，离页后旧响应不覆盖新页面数据', async () => {
  const { transform } = await import('esbuild')
  const gestureSource = await readFile(new URL('../src/services/use-card-order.ts', import.meta.url), 'utf8')
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  const compiled = await transform(gestureSource.replace(/import type.*\n/, '')
    .replace("import { getCurrentInstance, onUnmounted, ref } from 'vue'", 'const getCurrentInstance = () => null, onUnmounted = () => {}, ref = value => ({ value })')
    .replace("'./card-order.ts'", JSON.stringify(moduleUrl))
    .replace("import spacing from '../styles/spacing.json'", 'const spacing = { inline: 8, section: 12, controlMin: 44 }'), { loader: 'ts', format: 'esm' })
  const { useCardOrder } = await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'))
  let resolve, calls = 0
  const pending = new Promise(ok => { resolve = ok })
  const data = { value: rows.map(row => ({ ...row })) }
  const order = useCardOrder({ rows: data, visible: () => [...data.value].sort(compareCardOrder), disabled: () => false, save: () => { calls++; return pending } })
  order.keyboard(rows[0].id, 1)
  assert.equal(order.saving.value, rows[0].id)
  order.keyboard(rows[0].id, 1)
  assert.equal(calls, 1)
  order.reset()
  data.value = [{ id: '99', sortOrder: 8, name: '新账号数据' }]
  resolve([{ id: rows[0].id, sortOrder: 1 }])
  await pending; await Promise.resolve()
  assert.deepEqual(data.value, [{ id: '99', sortOrder: 8, name: '新账号数据' }])
  assert.equal(order.saving.value, '')
})
