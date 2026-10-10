import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

const source = await readFile(new URL('../src/services/time-selection.ts', import.meta.url), 'utf8')
const { timeSelectionBounds, resolveTimeWheelSelection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const record = { id: '9223372036854775807', date: '2026-10-04', startTime: 600, endTime: 659 }

test('禁选其他记录占用的分钟，排除自身和其他日期，不能跨过记录', () => {
  const existing = [record, { startTime: 540, endTime: 599 }, { startTime: 680, endTime: 700 }, { date: '2026-10-03', startTime: 0, endTime: 1439 }]
  assert.deepEqual(timeSelectionBounds(record, existing, 'startTime'), { min: 600, max: 659 })
  assert.deepEqual(timeSelectionBounds(record, existing, 'endTime'), { min: 600, max: 679 })
  assert.deepEqual(timeSelectionBounds({ ...record, startTime: 0, endTime: 0 }, [], 'startTime'), { min: 0, max: 0 })
  assert.deepEqual(timeSelectionBounds({ ...record, startTime: 1439, endTime: 1439 }, [], 'endTime'), { min: 1439, max: 1439 })
  const bounds = timeSelectionBounds(record, [{ startTime: 650, endTime: 700 }], 'startTime')
  assert.ok(bounds.min > bounds.max)
})

test('分钟连续滚动跨小时，支持快速跨多小时和反向返回', () => {
  assert.equal(resolveTimeWheelSelection(600, 599, 'minute', 0, 1439), 599)
  assert.equal(resolveTimeWheelSelection(599, 600, 'minute', 0, 1439), 600)
  assert.equal(resolveTimeWheelSelection(599, 721, 'minute', 0, 1439), 721)
  assert.equal(resolveTimeWheelSelection(721, 598, 'minute', 0, 1439), 598)
  assert.equal(resolveTimeWheelSelection(610, 11, 'hour', 0, 1439), 670)
})

test('调小时后连续跨过 59/00，小时联动同步通知不会回退分钟', () => {
  let selected = 599
  for (const [field, index, expected] of [
    ['hour', 11, 719], ['minute', 720, 720], ['hour', 12, 720],
    ['minute', 721, 721], ['minute', 719, 719], ['hour', 11, 719],
    ['minute', 718, 718], ['hour', 10, 658], ['minute', 660, 660],
    ['hour', 11, 660], ['minute', 661, 661],
  ]) {
    selected = resolveTimeWheelSelection(selected, index, field, 0, 1439)
    assert.equal(selected, expected, `${field} ${index}`)
  }
})

test('原生滚轮落在禁选项时回到边界，无合法范围时保留原值', () => {
  assert.equal(resolveTimeWheelSelection(600, 599, 'minute', 600, 679), 600)
  assert.equal(resolveTimeWheelSelection(679, 680, 'minute', 600, 679), 679)
  assert.equal(resolveTimeWheelSelection(0, -1, 'minute', 0, 1439), 0)
  assert.equal(resolveTimeWheelSelection(1439, 1440, 'minute', 0, 1439), 1439)
  assert.equal(resolveTimeWheelSelection(610, 15, 'hour', 600, 679), 679)
  assert.equal(resolveTimeWheelSelection(610, 15, 'hour', 1, 0), 610)
})
