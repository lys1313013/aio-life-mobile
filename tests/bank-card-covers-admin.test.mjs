import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../src/pages/admin/services/bank-card-covers.ts', import.meta.url), 'utf8')
const calls = []
let response
globalThis.__coverRequest = (...args) => { calls.push(args); return Promise.resolve(response) }
const service = await import('data:text/javascript;base64,' + Buffer.from(source.replace("import { request } from '../../../services/api.ts'", 'const request = globalThis.__coverRequest')).toString('base64'))
const id = '9223372036854775807', bankId = '9007199254740999', fileId = 'a'.repeat(32)
const cover = { id, name: '演示卡面', bankId, bankName: '演示银行', cardType: 'debit', fileId, sourceUrl: null, sortOrder: 0, isEnabled: 1, usageCount: 0 }
test('卡面写入只包含后端字段，长ID保留字符串且清空出处为null', async () => {
  response = cover
  await service.saveCoverTemplate({ ...cover, name: ' 演示卡面 ', sourceUrl: '', sortOrder: '0', userId: '1', usageCount: 5 })
  assert.deepEqual(calls.at(-1), ['/system/bank-card-covers', 'POST', { name: '演示卡面', bankId, cardType: 'debit', fileId, sourceUrl: null, sortOrder: 0, isEnabled: 1 }])
  await service.saveCoverTemplate(cover, cover)
  assert.equal(calls.at(-1)[0], '/system/bank-card-covers/' + id)
  assert.equal(calls.at(-1)[1], 'PUT')
  await service.setCoverEnabled(cover)
  assert.deepEqual(calls.at(-1), ['/system/bank-card-covers/' + id + '/enabled', 'PUT', { isEnabled: 0 }])
  await service.deleteCoverTemplate(cover)
  assert.deepEqual(calls.at(-1), ['/system/bank-card-covers/' + id, 'DELETE'])
})
test('引用约束、图片、URL、排序、银行和字符串ID校验在写入前执行', () => {
  assert.throws(() => service.coverPayload({ ...cover, bankId: '1' }, { ...cover, usageCount: 1 }), /不能修改/)
  assert.throws(() => service.coverPayload({ ...cover, cardType: 'credit' }, { ...cover, usageCount: 1 }), /不能修改/)
  assert.throws(() => service.deleteCoverTemplate({ ...cover, usageCount: 1 }), /请停用/)
  for (const invalid of [{ bankId: 123 }, { fileId: '42' }, { sortOrder: '' }, { sortOrder: -1 }, { sortOrder: 2147483648 }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://' }, { name: ' '.repeat(4) }]) {
    assert.throws(() => service.coverPayload({ ...cover, ...invalid }))
  }
  assert.throws(() => service.readCover({ ...cover, id: Number(id) }), /ID/)
  for (const usageCount of [0, 2, 2147483647]) {
    const result = service.readCover({ ...cover, usageCount })
    assert.equal(result.usageCount, usageCount)
    assert.equal(result.id, id)
  }
  // 仅读取边界暂时兼容未升级的服务端。
  assert.equal(service.readCover({ ...cover, usageCount: '2' }).usageCount, 2)
  for (const usageCount of [null, -1, 1.5, 2147483648, '2147483648', 'invalid']) {
    assert.throws(() => service.readCover({ ...cover, usageCount }), /使用数量异常/)
  }
})
test('查询过程中启停、编辑、删除和新增合并到慢响应，陈旧查询不会复活删除', () => {
  const journal = service.createCoverMutations(), since = journal.version()
  const another = { ...cover, id: '2' }, third = { ...cover, id: '3' }
  journal.record(id, { ...cover, isEnabled: 0 })
  journal.record('2')
  journal.record('3', third)
  assert.deepEqual(journal.merge([cover, another], since), [{ ...cover, isEnabled: 0 }, third])
  assert.deepEqual(journal.merge([cover], journal.version()), [cover])
  journal.clear(); assert.equal(journal.version(), 0)
})
test('完整和填满处理保持960x605，居中缩放且拒绝超大图', () => {
  const fit = service.coverPlacement(1000, 1000, 'contain')
  assert.deepEqual(fit, { x: 177.5, y: 0, width: 605, height: 605 })
  const fill = service.coverPlacement(1000, 1000, 'cover', 2)
  assert.deepEqual(fill, { x: -480, y: -657.5, width: 1920, height: 1920 })
  assert.throws(() => service.coverPlacement(5000, 5000, 'contain'), /1600万/)
})
