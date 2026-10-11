import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: [new URL('../src/pages/home/services/weread-shelf.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node' })
const { wereadShelfLayout, wereadShelfColumns, wereadShelfWidth } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))

test('窄卡片完整容纳三列，宽卡片增加列数，列宽加留白不超出视口', () => {
  for (const viewport of [272, 304, 364, 392, 600, 900]) {
    const { columnWidth, visibleColumns } = wereadShelfWidth(viewport)
    assert.ok(visibleColumns >= 3)
    assert.ok(columnWidth >= 44)
    assert.ok(Math.abs(columnWidth * visibleColumns + 12 * (visibleColumns - 1) + 24 - viewport) < 1e-9)
    if (viewport >= 600) assert.ok(visibleColumns > 3)
  }
})

test('普通卡片一排，高卡片增加排数，封面保持比例且不会无限放大', () => {
  for (const height of [240, 250, 280, 400, 520, 800]) {
    const layout = wereadShelfLayout(height, height)
    assert.equal(layout.rows > 1, height >= 400)
    assert.ok(layout.coverHeight >= 96 && layout.coverHeight <= 144)
    assert.ok(Math.abs(layout.coverWidth / layout.coverHeight - 2 / 3) < 1e-9)
    assert.ok(layout.rows * layout.itemHeight <= layout.bodyHeight)
    assert.ok(layout.coverHeight + 38 <= layout.itemHeight)
  }
  assert.deepEqual(wereadShelfLayout(520, 280), wereadShelfLayout(280, 280))
  assert.ok(wereadShelfLayout(undefined, 240).bodyHeight < wereadShelfLayout(240, 240).bodyHeight)
})

test('高卡片按列容纳多排，分页前后顺序稳定，尾列与长 ID 不丢失', () => {
  const books = Array.from({ length: 14 }, (_, index) => ({ bookId: '92233720368547758' + index }))
  for (const height of [240, 400, 520]) {
    const { rows } = wereadShelfLayout(height, height)
    const columns = wereadShelfColumns(books, rows)
    assert.deepEqual(columns.flat(), books)
    assert.ok(columns.every(column => column.length <= rows))
    assert.deepEqual(wereadShelfColumns(books.slice(0, 6), rows).flat(), books.slice(0, 6))
    assert.deepEqual(wereadShelfColumns([], rows), [])
    assert.deepEqual(wereadShelfColumns([books[0]], rows), [[books[0]]])
  }
})
