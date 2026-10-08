import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

async function harness(web = true) {
  let source = await readFile(new URL('../src/pages/home/services/use-business-order.ts', import.meta.url), 'utf8')
  source = source.replace(/import[^\n]+\n/g, '')
    .replace(/\/\/ #ifdef WEB\n([\s\S]*?)\/\/ #endif/g, (_, code) => web ? code : '')
    .replace(/\/\/ #ifndef WEB\n([\s\S]*?)\/\/ #endif/g, (_, code) => web ? '' : code)
  const js = (await transform(source.replace('export function', 'function'), { loader: 'ts' })).code
  const timers = new Map(), frames = new Map(), intervals = new Map(), saves = []
  let sequence = 0, rows = ['9223372036854775801', '9223372036854775802', '9223372036854775803'].map(id => ({ id }))
  const fixture = {
    ref: value => ({ value }), getCurrentInstance: () => null, onUnmounted: () => {},
    spacing: { inline: 8, controlMin: 44 }, businessCardRowHeight: 64,
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { const id = ++sequence; intervals.set(id, fn); return id },
    clearInterval: id => intervals.delete(id),
    window: { requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id }, cancelAnimationFrame: id => frames.delete(id), addEventListener() {}, removeEventListener() {} },
    uni: { vibrateShort() {}, createSelectorQuery: () => ({ in() { return this }, select() { return this }, boundingClientRect() { return this }, exec(fn) { fn([{ top: 100, bottom: 292, height: 192 }]) } }) },
  }
  const useBusinessOrder = new Function(...Object.keys(fixture), js + '\nreturn useBusinessOrder')(...Object.values(fixture))
  const order = useBusinessOrder({ selector: '.business-order-scroll-goal', rows: () => rows, disabled: () => false, save: async (from, to) => saves.push([from, to]) })
  const point = y => ({ touches: [{ clientX: 100, clientY: y }], preventDefault() {}, stopPropagation() {} })
  const begin = () => {
    order.start(rows[1].id, point(214))
    const [id, timer] = [...timers].find(([, timer]) => timer.delay === 300)
    timers.delete(id); timer.fn()
  }
  const flush = () => {
    const pending = web ? frames : timers
    for (const [id, value] of pending) { pending.delete(id); (web ? value : value.fn)() }
  }
  return { order, saves, timers, frames, intervals, point, begin, flush, rows, replaceRows: () => { rows = [...rows] } }
}

for (const web of [true, false]) {
  test(`目标 ${web ? 'H5' : '原生'} 高频移动合并，首尾位移有界且取消彻底清零`, async () => {
    const h = await harness(web)
    h.begin()
    for (let i = 0; i < 100; i++) h.order.move(h.point(1000 + i))
    assert.equal((web ? h.frames : h.timers).size, 1)
    assert.equal(h.order.style(h.rows[1].id).transform, 'translateY(0px)')
    h.flush()
    assert.equal(h.order.style(h.rows[1].id).transform, 'translateY(64px)')
    assert.equal(h.order.style(h.rows[2].id).transform, 'translateY(-64px)')
    h.order.move(h.point(-1000))
    h.order.cancel()
    h.flush()
    assert.equal(h.intervals.size, 0)
    assert.equal(h.frames.size + h.timers.size, 0)
    for (const row of h.rows) assert.deepEqual(h.order.style(row.id), { height: '64px', transform: 'translateY(0px)', zIndex: 0 })
    assert.deepEqual(h.saves, [])
  })

  test(`目标 ${web ? 'H5' : '原生'} 松手早于下一帧仍保存最新落点，旧列表不能排序`, async () => {
    const h = await harness(web)
    h.begin()
    h.order.move(h.point(130))
    h.order.finish()
    assert.deepEqual(h.saves, [[1, 0]])
    assert.equal(h.frames.size + h.timers.size, 0)
    h.begin()
    h.order.move(h.point(290))
    h.replaceRows()
    h.order.finish()
    assert.deepEqual(h.saves, [[1, 0]])
    assert.equal(h.order.dragging.value, '')
  })

  test(`目标 ${web ? 'H5' : '原生'} 普通滚动只记录实际位置，不反写滚动命令`, async () => {
    const h = await harness(web)
    h.order.scrolled({ detail: { scrollTop: 100 } })
    assert.equal(h.order.scrollTop.value, 0)
    h.begin()
    assert.equal(h.order.scrollTop.value, 100)
    h.order.cancel()
  })
}
