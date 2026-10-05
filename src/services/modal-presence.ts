import { computed, ref } from 'vue'

const count = ref(0)
export const modalOpen = computed(() => count.value > 0)

// 每个弹窗持有独立登记，嵌套弹窗关闭时不能提前恢复背景原生画布。
export function registerModal() {
  count.value++
  let released = false
  return () => {
    if (released) return
    released = true
    count.value--
  }
}
