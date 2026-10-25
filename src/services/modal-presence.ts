import { computed, ref } from 'vue'

const count = ref(0)
export const modalOpen = computed(() => count.value > 0)

// 仅用于微信原生画布的遮挡兼容；导航和遮罩不依赖此登记。
// 每个弹窗独立持有释放函数，内层关闭不能提前恢复背景画布。
export function registerModal() {
  count.value++
  let released = false
  return () => {
    if (released) return
    released = true
    count.value--
  }
}
