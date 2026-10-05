import { reactive, watch } from 'vue'
import { session } from './session.ts'

export function normalizeMenuVisual(menu) {
  return {
    icon: typeof menu?.icon === 'string' && menu.icon.trim() ? menu.icon.trim() : 'lucide:layout-dashboard',
    iconColor: /^#[\da-f]{6}$/i.test(menu?.iconColor || '') ? menu.iconColor : undefined,
  }
}

export function createMenuVisuals(state, identity) {
  let generation = 0, pending = null, updatedAt = 0, lastFetch = null
  function clear() {
    generation++; pending = null; updatedAt = 0; lastFetch = null
    Object.assign(state, { menus: [], cards: {}, ready: false, loading: false, error: '' })
  }
  function load(fetch, force = false) {
    lastFetch = fetch
    if (pending && !force) return pending
    if (state.ready && !force && Date.now() - updatedAt < 60000) return Promise.resolve()
    const version = ++generation, owner = identity()
    state.loading = true; state.error = ''
    const current = () => version === generation && owner === identity()
    const task = (async () => {
      try {
        const data = await fetch('/menu/visuals?client=mobile')
        if (!current()) return
        if (!Array.isArray(data?.menus) || !data?.cards || typeof data.cards !== 'object') throw Error('菜单配置异常，请重试')
        state.menus = data.menus; state.cards = data.cards; state.ready = true; updatedAt = Date.now()
      } catch (error) {
        if (current()) state.error = error.message || '加载失败'
      } finally {
        if (current()) { state.loading = false; pending = null }
      }
    })()
    pending = task
    return task
  }
  function afterWrite(path, method) {
    path = path.split('?')[0]
    if (method !== 'GET' && (path === '/menu/admin' || path.startsWith('/menu/admin/')) && lastFetch && identity()) void load(lastFetch, true)
  }
  return {
    clear, load, afterWrite,
    visual: key => normalizeMenuVisual(state.cards[key]),
    menuVisual: (menuId, currentMenu = null) => normalizeMenuVisual(state.menus.find(menu => menu.menuId === menuId) || currentMenu),
  }
}

export const menuVisualState = reactive({ menus: [], cards: {}, ready: false, loading: false, error: '' })
export const menuVisuals = createMenuVisuals(menuVisualState, () => session.token)
watch(() => session.token, () => menuVisuals.clear(), { flush: 'sync' })
