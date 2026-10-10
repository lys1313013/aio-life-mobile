import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'

const bundle = await build({ entryPoints: ['src/pages/home/time-donut-image.ts'], bundle: true, write: false, format: 'esm' })
const { timeDonutImage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const goalBundle = await build({ entryPoints: ['src/pages/home/goal-progress-image.ts'], bundle: true, write: false, format: 'esm' })
const { goalProgressImage } = await import(`data:text/javascript;base64,${Buffer.from(goalBundle.outputFiles[0].text).toString('base64')}`)

async function registry() {
  const source = await readFile(new URL('../src/services/modal-presence.ts', import.meta.url), 'utf8')
  const js = (await transform(source.replace(/import[^\n]+\n/g, '').replace(/export /g, ''), { loader: 'ts' })).code
  return new Function('computed', 'ref', js + '\nreturn { modalOpen, registerModal }')(computed, ref)
}

async function donut() {
  const source = await readFile(new URL('../src/pages/home/TimeDonut.uvue', import.meta.url), 'utf8')
  const stack = [true]
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    .split('\n').filter(line => {
      const directive = line.match(/\/\/ #(ifdef|ifndef) (\S+)/)
      if (directive) {
        const matches = directive[2] === 'MP-WEIXIN'
        stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
        return false
      }
      if (line.includes('// #endif')) { stack.pop(); return false }
      return stack.at(-1)
    }).join('\n').replace(/import[^\n]+\n/g, '')
  const js = (await transform(script, { loader: 'ts' })).code
  const modals = await registry()
  const props = reactive({ groups: [{ id: 'one', minutes: 60, color: '#faad14' }], active: true })
  const isDark = ref(false)
  const fixture = {
    computed, ref, watch, nextTick, isDark, timeDonutImage, iconSource: svg => svg,
    defineProps: () => props,
    // 小程序分支不能再申请屏幕 Canvas，弹窗、滚动和离页均不需要原生层恢复。
    uni: { createCanvasContextAsync: () => assert.fail('微信时迹不应创建 Canvas') },
  }
  const component = new Function(...Object.keys(fixture), js + '\nreturn { imageSource, failed, imageVisible, retryImage }')(...Object.values(fixture))
  return { ...modals, ...component, props, isDark }
}

test('嵌套弹窗全部关闭才恢复，重复释放不影响后续弹窗', async () => {
  const h = await registry()
  const first = h.registerModal(), second = h.registerModal()
  assert.equal(h.modalOpen.value, true)
  first(); first(); assert.equal(h.modalOpen.value, true)
  second(); assert.equal(h.modalOpen.value, false)
  const third = h.registerModal()
  assert.equal(h.modalOpen.value, true)
  third(); assert.equal(h.modalOpen.value, false)
})

test('微信环图在嵌套弹窗、离页和返回时始终使用普通图像，更新保留最新数据', async () => {
  const h = await donut()
  const close = h.registerModal(), closeNested = h.registerModal()
  h.props.groups = [{ id: 'two', minutes: 30, color: '#722ed1' }]
  h.isDark.value = true
  await nextTick()
  assert.match(h.imageSource.value, /stroke="#722ed1"/)
  close(); await nextTick()
  assert.equal(h.modalOpen.value, true)
  assert.match(h.imageSource.value, /stroke="#722ed1"/)
  h.props.active = false; closeNested(); await nextTick()
  assert.equal(h.modalOpen.value, false)
  h.props.active = true; await nextTick()
  assert.match(h.imageSource.value, /stroke="#722ed1"/)
  h.props.groups = []; await nextTick()
  assert.match(h.imageSource.value, /stroke="#45474d"/)
  h.isDark.value = false; await nextTick()
  assert.match(h.imageSource.value, /stroke="#c9c9cc"/)
})

test('微信图片加载失败可重新挂载重试，数据变化清除旧错误', async () => {
  const h = await donut()
  h.failed.value = true
  const retry = h.retryImage()
  assert.equal(h.failed.value, false)
  assert.equal(h.imageVisible.value, false)
  await retry
  assert.equal(h.imageVisible.value, true)
  h.failed.value = true
  h.props.groups = [{ id: 'new', minutes: 1, color: '#13c2c2' }]
  await nextTick()
  assert.equal(h.failed.value, false)
  assert.match(h.imageSource.value, /stroke="#13c2c2"/)
})

test('微信矢量环图保留小分类的精确角度、透明中心及合法颜色属性', () => {
  const single = timeDonutImage([{ id: 'single', minutes: 1440, color: '#faad14' }], false)
  assert.match(single, /r="44.5" fill="none" stroke="#faad14" stroke-width="19"/)
  assert.doesNotMatch(single, /<path/)
  const small = timeDonutImage([{ id: 'large', minutes: 1439, color: '#faad14' }, { id: 'small', minutes: 1, color: '#13c2c2' }], false)
  assert.equal((small.match(/<path /g) || []).length, 2)
  assert.match(small, /A54,54 0 1,1/)
  assert.match(small, /A54,54 0 0,1/)
  assert.match(small, /A35,35 0 0,0/)
  const escaped = timeDonutImage([{ id: 'color', minutes: 1, color: '"/><script>&' }], false)
  assert.doesNotMatch(escaped, /<script>/)
  assert.match(escaped, /&quot;\/&gt;&lt;script&gt;&amp;/)
})

test('微信目标进度图的零进度不画圆点，满进度闭合，超界进度按边界显示', () => {
  for (const value of [0, -1]) assert.doesNotMatch(goalProgressImage(value, '#427bea'), /<circle/)
  for (const value of [100, 101]) {
    const svg = goalProgressImage(value, '#427bea')
    assert.match(svg, /r="25"/)
    assert.doesNotMatch(svg, /stroke-dasharray/)
  }
  assert.match(goalProgressImage(25, '#427bea'), new RegExp('stroke-dasharray="' + Math.PI * 50 / 4))
})
