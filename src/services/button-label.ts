import { isDark } from './theme.ts'

/** 将按钮状态类映射到文字类，避免 App 依赖容器的颜色、字号继承。 */
export function buttonLabelClasses(value: unknown): string[] {
  const result = ['app-button-label']
  if (isDark.value) result.push('app-button-label-dark')
  function append(item: unknown) {
    if (typeof item === 'string') {
      for (const name of item.split(/\s+/)) if (name) result.push(name + '-label')
    } else if (Array.isArray(item)) {
      item.forEach(append)
    } else if (item && typeof item === 'object') {
      for (const [name, enabled] of Object.entries(item)) if (enabled) append(name)
    }
  }
  append(value)
  return result
}
