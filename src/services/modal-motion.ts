import spacing from '../styles/spacing.json'

// #ifdef WEB
type ModalElement = HTMLElement & { __modalMotion?: Animation[]; __modalTrigger?: HTMLElement }
function surface(element: HTMLElement) { return element.classList.contains('modal-mask') ? element : element.querySelector<HTMLElement>('.modal-mask') || element }
export function enterModal(element: ModalElement, done: () => void, enabled: boolean) {
  element.inert = false
  element.removeAttribute('aria-hidden')
  surface(element).removeAttribute('data-modal-leaving')
  const trigger = document.activeElement
  if (trigger instanceof HTMLElement && trigger !== document.body) element.__modalTrigger = trigger
  runModalMotion(element, done, enabled, false)
}
export function leaveModal(element: ModalElement, done: () => void, enabled: boolean) {
  surface(element).setAttribute('data-modal-leaving', 'true')
  element.setAttribute('aria-hidden', 'true')
  element.inert = true
  runModalMotion(element, () => {
    const trigger = element.__modalTrigger
    done()
    if (trigger?.isConnected && (!document.activeElement || document.activeElement === document.body || element.contains(document.activeElement))) trigger.focus({ preventScroll: true })
  }, enabled, true)
}
function runModalMotion(element: ModalElement, done: () => void, enabled: boolean, leaving: boolean) {
  element.__modalMotion?.forEach(animation => animation.cancel())
  const mask = surface(element)
  if (!enabled || mask.getAttribute('data-modal-motion') === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return }
  const panel = element.querySelector<HTMLElement>('.modal-panel')
  if (!panel || typeof element.animate !== 'function') { done(); return }
  const options = { duration: leaving ? 240 : 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
  const opacity = leaving ? [1, 0] : [0, 1]
  const transforms = [`translateY(${spacing.section}px) scale(0.98)`, 'translateY(0) scale(1)']
  let animations: Animation[]
  try {
    animations = [mask.animate({ opacity }, options),
      panel.animate({ transform: leaving ? [...transforms].reverse() : transforms }, options)]
  } catch (_) { done(); return }
  element.__modalMotion = animations
  Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
    if (element.__modalMotion !== animations) return
    element.__modalMotion = undefined
    done()
  })
}
// #endif
