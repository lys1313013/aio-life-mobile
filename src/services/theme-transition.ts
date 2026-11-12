import { nextTick } from 'vue'
import { isDark } from './theme.ts'

/** 浏览器用主题快照做圆形揭幕；原生端由页面颜色 transition 平滑切换。 */
export async function animateThemeChange(update: () => void) {
  // #ifdef WEB
  if (typeof document.startViewTransition === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const width = document.documentElement.clientWidth
    const height = window.innerHeight
    // 往返共用右上角圆心及对角半径，让第二次切换沿原路径退回。
    const x = width
    const y = 0
    const radius = Math.hypot(width, height)
    document.documentElement.classList.add('aio-theme-transition')
    let transition: ViewTransition
    try {
      transition = document.startViewTransition(async () => {
        update()
        document.documentElement.classList.toggle('aio-theme-transition-dark', isDark.value)
        await nextTick()
      })
    } catch (_) {
      document.documentElement.classList.remove('aio-theme-transition', 'aio-theme-transition-dark')
      update()
      return
    }
    // 页面隐藏等情况会跳过快照；仍等待主题更新，保留存储失败的错误反馈。
    const ready = transition.ready.then(() => true, () => false)
    try {
      await transition.updateCallbackDone
      if (await ready) {
        try {
          const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
          // 与 Web 一样反放同一组关键帧，而不是换圆心再展开。
          const animation = document.documentElement.animate({
            clipPath: isDark.value ? [...clipPath].reverse() : clipPath,
          }, {
            duration: 800,
            easing: 'ease-in',
            pseudoElement: isDark.value ? '::view-transition-old(root)' : '::view-transition-new(root)',
          })
          await animation.finished.catch(() => {})
        } catch (_) {
          // 动画能力不足时保留已成功保存的主题，不误报业务切换失败。
        }
      }
    } finally {
      transition.skipTransition()
      await transition.finished.catch(() => {})
      document.documentElement.classList.remove('aio-theme-transition', 'aio-theme-transition-dark')
    }
    return
  }
  // #endif
  update()
}
