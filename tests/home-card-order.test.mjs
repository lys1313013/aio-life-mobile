import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
const source = await readFile(new URL('../src/pages/home/services/home-card-order.ts', import.meta.url), 'utf8')
const { mergeVisibleCardOrder, closestCard, cardDropIndex, projectCardLayout } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const items = ['time', 'links', 'goal', 'reading', 'movie'].map((key, sortOrder) => ({ cardKey: 'section.' + key, group: 'section', enabled: key !== 'links', sortOrder }))
test('首页排序完整覆盖分组，关闭与空卡片留在原位，不改开关', () => {
  const before = structuredClone(items)
  assert.deepEqual(mergeVisibleCardOrder(items, 'section', ['section.reading', 'section.time', 'section.goal']), ['section.reading', 'section.links', 'section.time', 'section.goal', 'section.movie'])
  assert.deepEqual(items, before)
  assert.throws(() => mergeVisibleCardOrder(items, 'section', ['section.goal', 'section.goal']))
  assert.throws(() => mergeVisibleCardOrder(items, 'section', ['overview.read']))
})
const rects = [
  { key: 'section.time', left: 10, right: 190, top: 100, bottom: 400, height: 300, width: 180 },
  { key: 'section.goal', left: 200, right: 380, top: 100, bottom: 240, height: 140, width: 180 },
  { key: 'section.reading', left: 10, right: 190, top: 412, bottom: 650, height: 238, width: 180 },
]
test('不等高多列卡片按实际二维区域命中，边缘落点可找最近卡片', () => {
  assert.equal(closestCard(rects, 300, 200), 'section.goal')
  assert.equal(closestCard(rects, 100, 350), 'section.time')
  assert.equal(closestCard(rects, 100, 600), 'section.reading')
  assert.equal(closestCard(rects, 500, 170), 'section.goal')
})
async function harness(web) {
  let controller = await readFile(new URL('../src/pages/home/services/use-home-card-order.ts', import.meta.url), 'utf8')
  controller = controller.replace(/import[^\n]+\n/g, '')
    .replace(/\/\/ #ifdef WEB\n([\s\S]*?)\/\/ #endif/g, (_, code) => web ? code : '')
    .replace(/\/\/ #ifndef WEB\n([\s\S]*?)\/\/ #endif/g, (_, code) => web ? '' : code)
  const js = (await transform(controller.replace('export function', 'function'), { loader: 'ts' })).code
  const timers = new Map(), intervals = new Map(), saves = [], listeners = new Map()
  let version = 'A', disabled = false, measure, sequence = 0
  const fixture = {
    ref: value => ({ value }), getCurrentInstance: () => null, onUnmounted() {}, cardDropIndex, projectCardLayout,
    spacing: { detail: 4, inline: 8, controlMin: 44 },
    setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { const id = ++sequence; intervals.set(id, fn); return id }, clearInterval: id => intervals.delete(id),
    window: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    uni: { vibrateShort() {}, createSelectorQuery: () => ({ in() { return this }, select() { return this }, selectAll() { return this }, boundingClientRect() { return this }, exec(fn) { measure = fn } }) },
  }
  const create = new Function(...Object.keys(fixture), js + '\nreturn useHomeCardOrder')(...Object.values(fixture))
  const order = create({ rows: () => rects.map(rect => ({ cardKey: rect.key })), disabled: () => disabled, signature: () => version, save: async (group, keys) => saves.push({ group, keys }) })
  const point = (x, y) => ({ touches: [{ clientX: x, clientY: y }], preventDefault() {}, stopPropagation() {} })
  function measured() { measure([{ top: 0, bottom: 700, height: 700 }, { height: 1500 }, rects.map(rect => ({ ...rect, id: 'home-order-' + rect.key }))]) }
  function held() { for (const [id, fn] of timers) { timers.delete(id); fn() } }
  function begin() { order.start('section', 'section.time', point(100, 170)); held(); measured() }
  return { order, saves, timers, intervals, listeners, point, begin, held, measured, stale: () => { version = 'B' }, disable: () => { disabled = true } }
}
for (const web of [true, false]) {
  test(`首页 ${web ? 'H5' : '原生'} 拖动跨列，松手仅提交一次，取消不保存`, async () => {
    const h = await harness(web)
    h.begin(); h.order.move(h.point(300, 200)); h.order.finish(); h.order.finish()
    assert.deepEqual(h.saves, [{ group: 'section', keys: ['section.goal', 'section.time', 'section.reading'] }])
    assert.equal(h.intervals.size, 0)
    h.begin(); h.order.move(h.point(100, 600)); h.order.cancel(); h.order.finish()
    assert.equal(h.saves.length, 1)
    // A resting card must not create a containing block for its fixed editors.
    assert.deepEqual(h.order.style('section.time'), {})
  })
  test(`首页 ${web ? 'H5' : '原生'} 边缘自动滚动及滚动补偿，过期测量/配置变化不保存`, async () => {
    const h = await harness(web)
    h.begin(); h.order.move(h.point(100, 695)); for (const fn of h.intervals.values()) fn()
    assert.equal(h.order.scrollTop.value, 8)
    h.order.scrolled({ detail: { scrollTop: 8 } })
    assert.equal(h.order.target.value, 'section.reading')
    h.stale(); h.order.finish(); assert.deepEqual(h.saves, [])
    h.order.start('section', 'section.time', h.point(100, 170)); h.held(); h.order.cancel(); h.measured()
    assert.equal(h.order.dragging.value, '')
    assert.equal(h.intervals.size, 0)
  })
}

for (const web of [true, false]) test(`首页 ${web ? 'H5' : '原生'} 长按前不拦截短按与滚动，取消清理定时器`, async () => {
  const h = await harness(web)
  h.order.start('section', 'section.time', h.point(100, 170))
  assert.equal(h.order.dragging.value, '')
  assert.equal(h.order.clickBlocked(), false)
  h.order.finish(); assert.equal(h.timers.size, 0)
  h.order.start('section', 'section.time', h.point(100, 170))
  h.order.move(h.point(100, 210)); assert.equal(h.timers.size, 0)
  h.held(); assert.equal(h.order.dragging.value, '')
  h.begin(); assert.equal(h.order.clickBlocked(), true)
  h.order.cancel(); assert.equal(h.order.clickBlocked(), true)
  assert.deepEqual(h.saves, [])
})

test('不等高卡片重新排布与实际换行一致，保留行间距', () => {
  const layout = projectCardLayout(rects, ['section.goal', 'section.reading', 'section.time'])
  assert.deepEqual(layout.map(({key,left,top,bottom}) => ({key,left,top,bottom})), [
    { key: 'section.goal', left: 10, top: 100, bottom: 240 },
    { key: 'section.reading', left: 200, top: 100, bottom: 338 },
    { key: 'section.time', left: 10, top: 350, bottom: 650 },
  ])
})
test('单列卡片落在上半部插前面，下半部插后面，越过间隙仍按最终插入位置预览', () => {
  const rows = [
    { key: 'a', left: 0, right: 300, top: 0, bottom: 100, height: 100, width: 300 },
    { key: 'b', left: 0, right: 300, top: 108, bottom: 408, height: 300, width: 300 },
    { key: 'c', left: 0, right: 300, top: 416, bottom: 556, height: 140, width: 300 },
  ]
  assert.equal(cardDropIndex(rows, 'c', 150, 120), 1)
  assert.equal(cardDropIndex(rows, 'c', 150, 400), 2)
  assert.equal(cardDropIndex(rows, 'a', 150, 120), 0)
  assert.equal(cardDropIndex(rows, 'a', 150, 400), 1)
  assert.deepEqual(projectCardLayout(rows, ['c', 'a', 'b']).map(rect => rect.top), [0, 148, 256])
})
for (const web of [true, false]) test(`首页 ${web ? 'H5' : '原生'} 拖动预览真实让位，提交与预览一致，取消恢复且不留 transform`, async () => {
  const h = await harness(web)
  h.begin(); h.order.move(h.point(300, 200))
  const preview = ['section.goal', 'section.time', 'section.reading']
  assert.deepEqual(h.order.previewKeys.value, preview)
  assert.deepEqual(h.order.ordered('section', rects, rect => rect.key).map(rect => rect.key), preview)
  assert.equal(h.order.style('section.time').height, '300px')
  assert.match(h.order.contentStyle('section.time').transform, /translate/)
  h.order.finish()
  assert.deepEqual(h.saves[0].keys, preview)
  assert.deepEqual(h.order.previewKeys.value, [])
  assert.deepEqual(h.order.contentStyle('section.time'), {})
})
