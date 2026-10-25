import { computed, nextTick, ref, shallowRef } from 'vue'

type ModalBackLayer = { page: object; close: () => void }
const layers = shallowRef<ModalBackLayer[]>([])

// 微信每页只能启用一个 page-container。最早打开的层持有容器，
// 返回事件交给最后打开的层；按页面实例隔离，不能用路由字符串合并页面。
export function registerModalBack(page: object, close: () => void, flushNative: () => Promise<unknown> = nextTick) {
  const layer: ModalBackLayer = { page, close }
  layers.value = [...layers.value, layer]
  const isHost = computed(() => layers.value.find(item => item.page === page) === layer)
  const shown = ref(true)
  let active = true
  let leaving: ModalBackLayer | null = null

  function top() {
    const current = layers.value.filter(item => item.page === page)
    return current.length > 0 ? current[current.length - 1] : null
  }
  function beforeLeave() {
    if (active && isHost.value && shown.value && leaving === null) leaving = top()
  }
  async function afterLeave() {
    if (!active || leaving === null) return
    const target = leaving
    leaving = null
    // 原生返回已将容器收起，先同步 show，再等待业务层卸载。
    shown.value = false
    // 关闭动画期间若目标已被取消或出现新弹层，不误关其他层。
    if (top() === target) target.close()
    await nextTick()
    if (!active) return
    // Vue 更新完成不等于微信 setData 已落到视图；必须让原生端先收到 false。
    await flushNative()
    // 内层关闭或 busy 拒绝关闭后，为剩余弹窗重新接住下一次返回。
    if (active && isHost.value) shown.value = true
  }
  function dispose() {
    if (!active) return
    active = false
    leaving = null
    layers.value = layers.value.filter(item => item !== layer)
  }
  return { isHost, shown, beforeLeave, afterLeave, dispose }
}
