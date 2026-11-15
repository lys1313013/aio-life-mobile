import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { computed, nextTick, reactive, ref, watch } from 'vue'

async function harness({ platform = 'MP-WEIXIN', fill = false, footer = true } = {}) {
  const source = await readFile('src/components/AdaptiveModal.uvue', 'utf8')
  const stack = [true]
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    .split('\n').filter(line => {
      const directive = line.match(/\/\/ #(ifdef|ifndef) (\S+)/)
      if (directive) {
        const matches = directive[2] === platform
        stack.push(stack.at(-1) && (directive[1] === 'ifdef' ? matches : !matches))
        return false
      }
      if (line.includes('// #endif')) { stack.pop(); return false }
      return stack.at(-1)
    }).join('\n').replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*;?\n/gm, '')
  const spacing = JSON.parse(await readFile('src/styles/spacing.json', 'utf8'))
  const ui = (await readFile('src/services/mobile-ui.ts', 'utf8'))
    .replace("import spacing from '../styles/spacing.json'", `const spacing = ${JSON.stringify(spacing)}`)
  const { modalAvailableHeight } = await import(`data:text/javascript;base64,${Buffer.from(ui).toString('base64')}`)
  const js = (await transform(script, { loader: 'ts' })).code
  const mounted = [], cleanups = [], listeners = new Map(), keyboardListeners = new Set()
  const props = reactive({ focusTarget: '', fill, label: '模拟弹窗', showClose: false, bare: false })
  const measurements = { '.modal-content': 240, '.modal-footer': 60,
    '.modal-scroll': { top: 64, bottom: 364, height: 300 },
    '.focused-input': { top: 400, bottom: 444, height: 44 } }
  const instance = { slots: footer ? { footer: () => {} } : {}, proxy: { $el: { querySelector: () => null } } }
  const windowInfo = { windowHeight: 700, safeAreaInsets: { top: 24, bottom: 0 } }
  const viewport = {
    height: 700, offsetTop: 0,
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  const fixtures = {
    computed, nextTick, reactive, ref, watch, spacing, modalAvailableHeight,
    useWindowResize: () => {}, getCurrentInstance: () => instance,
    onMounted: callback => mounted.push(callback), onUnmounted: callback => cleanups.push(callback),
    onUpdated: () => {}, provide: () => {}, defineEmits: () => () => {}, defineExpose: () => {},
    defineProps: () => props, withDefaults: value => value,
    registerModal: () => () => {},
    window: { visualViewport: viewport },
    ResizeObserver: class { observe() {} disconnect() {} },
    uni: {
      getWindowInfo: () => windowInfo,
      onKeyboardHeightChange: callback => keyboardListeners.add(callback),
      offKeyboardHeightChange: callback => keyboardListeners.delete(callback),
      createSelectorQuery: () => ({
        selector: '', rects: [], in() { return this }, select(selector) { this.selector = selector; return this },
        boundingClientRect(callback) {
          const value = measurements[this.selector];
          const rect = typeof value === 'number' ? { height: value } : value;
          if (callback) callback(rect);
          this.rects.push(rect);
          return this;
        },
        scrollOffset() { this.rects.push(measurements.scrollOffset); return this },
        exec(callback) { callback?.(this.rects) },
      }),
    },
  }
  const component = new Function(...Object.keys(fixtures), js + '\nreturn { height, availableHeight, footerHeight, measure, resize, viewportTop, useViewportFrame, scrollTop, onScroll, revealFocusedInput }')(...Object.values(fixtures))
  for (const callback of mounted) callback()
  const flush = async () => { for (let i = 0; i < 5; i++) await nextTick() }
  await flush()
  return { ...component, props, instance, measurements, viewport, listeners, flush,
    keyboard: height => keyboardListeners.forEach(callback => callback({ height })),
    close: () => cleanups.forEach(callback => callback()),
  }
}

test('短正文按内容收缩，长正文给固定footer预留空间', async () => {
  const h = await harness()
  assert.equal(h.height.value, 240)
  assert.equal(h.footerHeight.value, 60)
  h.measurements['.modal-content'] = 1200
  await h.measure()
  assert.equal(h.height.value + h.footerHeight.value, h.availableHeight.value)
  assert.equal(h.height.value, 568)
  h.close()
})

test('footer新增错误信息或按钮换行后，正文自动缩小且键盘安全区继续生效', async () => {
  const h = await harness()
  h.measurements['.modal-content'] = 1200
  h.measurements['.modal-footer'] = 124
  await h.measure()
  assert.equal(h.height.value, 504)
  h.keyboard(280)
  await h.flush()
  assert.equal(h.availableHeight.value, 348)
  assert.equal(h.height.value, 224)
  h.measurements['.modal-content'] = 80
  await h.measure()
  assert.equal(h.height.value, 80)
  h.close()
})

test('无footer保持旧高度，fill切换回自适应后重新测量正文', async () => {
  const plain = await harness({ footer: false })
  plain.measurements['.modal-content'] = 1200
  await plain.measure()
  assert.equal(plain.height.value, plain.availableHeight.value)
  assert.equal(plain.footerHeight.value, 0)
  plain.close()

  const h = await harness({ fill: true })
  assert.equal(h.height.value, h.availableHeight.value)
  h.props.fill = false
  await h.flush()
  assert.equal(h.height.value, 240)
  assert.equal(h.footerHeight.value, 60)
  h.close()
})

test('H5非fill模式随visualViewport避让键盘并移除监听', async () => {
  const h = await harness({ platform: 'WEB' })
  h.measurements['.modal-content'] = 1200
  h.viewport.height = 420
  h.viewport.offsetTop = 18
  h.listeners.get('resize')()
  await h.flush()
  assert.equal(h.availableHeight.value, 348)
  assert.equal(h.height.value, 288)
  assert.equal(h.viewportTop.value, 18)
  assert.equal(h.useViewportFrame.value, true)
  h.close()
  assert.equal(h.listeners.size, 0)
})


test('聚焦项在键盘缩小正文后只滚动弹窗，重新聚焦支持同值回拨', async () => {
  const h = await harness()
  h.props.focusTarget = '.focused-input'
  await h.flush()
  assert.equal(h.scrollTop.value, 88)
  h.onScroll({ detail: { scrollTop: 20 } })
  // 用户向上滚过后，再次聚焦同一项仍需要滚回原目标。
  h.measurements['.focused-input'] = { top: 380, bottom: 424, height: 44 }
  await h.revealFocusedInput()
  await h.flush()
  assert.equal(h.scrollTop.value, 88)
  // 键盘进一步展开后，原本可见的输入项需要继续向上滚。
  h.measurements['.modal-scroll'] = { top: 64, bottom: 264, height: 200 }
  h.onScroll({ detail: { scrollTop: 88 } })
  h.measurements['.focused-input'] = { top: 312, bottom: 356, height: 44 }
  h.keyboard(280)
  await h.flush()
  assert.equal(h.scrollTop.value, 188)
  h.close()
})

test('聚焦顶部字段可向上回滚，失焦和卸载后不再执行旧滚动', async () => {
  const h = await harness()
  h.onScroll({ detail: { scrollTop: 160 } })
  h.measurements['.focused-input'] = { top: 20, bottom: 64, height: 44 }
  h.props.focusTarget = '.focused-input'
  await h.flush()
  assert.equal(h.scrollTop.value, 108)
  h.onScroll({ detail: { scrollTop: 108 } })
  const pending = h.revealFocusedInput()
  h.props.focusTarget = ''
  await pending
  await h.flush()
  assert.equal(h.scrollTop.value, 108)
  h.props.focusTarget = '.focused-input'
  h.close()
  await h.flush()
  assert.equal(h.scrollTop.value, 108)
})


test('键盘期间平台滚动早于scroll回执时，使用同批测量的实际偏移', async () => {
  const h = await harness()
  h.onScroll({ detail: { scrollTop: 0 } })
  h.measurements.scrollOffset = { scrollTop: 200 }
  h.props.focusTarget = '.focused-input'
  await h.flush()
  assert.equal(h.scrollTop.value, 288)
  h.close()
})
