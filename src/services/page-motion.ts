import { nextTick } from 'vue'
import tabs from './tab-bar.generated.json'

const tabRoutes = tabs.map(tab => '/' + tab.pagePath)
const sessionRoutes = ['/pages/login/index', '/pages/auth/index']
function routePath(url: string) {
  const path = (url || '').split('?')[0]
  return path === '/' ? '/pages/home/index' : path
}
export function isPageMotionRoute(url: string) {
  const path = routePath(url)
  return path.startsWith('/pages/') && !sessionRoutes.includes(path)
}
export function pageMotionDirection(to: string, from: string, currentPosition: number, previousPosition: number, method = '') {
  const target = routePath(to), current = routePath(from)
  if (target === current || !isPageMotionRoute(to) || !isPageMotionRoute(from)) return ''
  // 重置导航栈和底部 Tab 平级切换，不伪装成层级进退。
  if (['switchTab', 'redirectTo', 'reLaunch'].includes(method)) return ''
  if (tabRoutes.includes(target) && tabRoutes.includes(current)) return ''
  if (method === 'navigateBack' || currentPosition < previousPosition) return 'back'
  if (tabRoutes.includes(target)) return ''
  return 'forward'
}

let navigation: { method: string; target: string } | null = null
/** 在菜单锁放行后记录真实导航；App 交给原生窗口，微信保持宿主导航。 */
export function configurePageMotion(name: string, options: any = {}) {
  const pages = getCurrentPages()
  const current = '/' + (pages[pages.length - 1]?.route || '')
  const target = name === 'navigateBack'
    ? '/' + (pages[Math.max(0, pages.length - 1 - (options.delta || 1))]?.route || '')
    : options.url || ''
  // #ifdef WEB
  navigation = { method: name, target: routePath(target) }
  // #endif
  // #ifdef APP
  const direction = pageMotionDirection(target, current, 0, 0, name)
  if ((name === 'navigateTo' || name === 'navigateBack') && direction) {
    options.animationDuration ??= 360
    if (name === 'navigateTo') options.animationType ??= 'pop-in'
  }
  // #endif
}

// #ifdef WEB
let installed = false
export function installPageMotion(router: any) {
  if (installed || !router?.beforeResolve) return
  installed = true
  let lastPosition = Number(window.history.state?.position || 0)
  let active: { release: () => void; skip: () => void } | null = null
  let revision = 0
  router.beforeResolve((to: any, from: any) => {
    const method = navigation?.target === routePath(to.fullPath) ? navigation.method : ''
    navigation = null
    const direction = pageMotionDirection(to.fullPath, from.fullPath,
      Number(window.history.state?.position || 0), lastPosition, method)
    active?.release()
    active?.skip()
    active = null
    if (!direction || typeof document.startViewTransition !== 'function'
      || document.visibilityState === 'hidden'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const version = ++revision
    return new Promise<void>(allowNavigation => {
      let release = () => {}
      const updated = new Promise<void>(resolve => { release = resolve })
      const root = document.documentElement
      root.classList.add('aio-page-motion')
      root.classList.toggle('aio-page-motion-back', direction === 'back')
      let transition: ViewTransition
      try {
        transition = document.startViewTransition(async () => {
          allowNavigation()
          await updated
          await nextTick()
        })
      } catch (_) {
        root.classList.remove('aio-page-motion', 'aio-page-motion-back')
        allowNavigation()
        return
      }
      active = { release, skip: () => transition.skipTransition() }
      // 路由异常或页面在快照前隐藏时也必须放行，不能把导航锁在动画里。
      const timeout = window.setTimeout(() => { allowNavigation(); release(); transition.skipTransition() }, 1500)
      const finish = () => {
        window.clearTimeout(timeout)
        allowNavigation()
        release()
        if (version !== revision) return
        active = null
        root.classList.remove('aio-page-motion', 'aio-page-motion-back')
      }
      transition.ready.then(async () => {
        const back = direction === 'back'
        try {
          const options = { duration: 360, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
          const animations = [
            root.animate({ transform: back ? ['translateX(-25%)', 'translateX(0)'] : ['translateX(100%)', 'translateX(0)'] },
              { ...options, pseudoElement: '::view-transition-new(root)' }),
            root.animate({ transform: back ? ['translateX(0)', 'translateX(100%)'] : ['translateX(0)', 'translateX(-25%)'] },
              { ...options, pseudoElement: '::view-transition-old(root)' }),
          ]
          await Promise.all(animations.map(animation => animation.finished.catch(() => {})))
        } catch (_) { /* 动画不支持时仍保留已经完成的导航。 */ }
        transition.skipTransition()
      }, () => { allowNavigation(); release() })
      transition.finished.then(finish, finish)
    })
  })
  router.afterEach(async () => {
    lastPosition = Number(window.history.state?.position || 0)
    const pending = active
    await nextTick()
    pending?.release()
  })
  router.onError(() => { active?.release(); active?.skip() })
}
// #endif
