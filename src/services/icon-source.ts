// #ifdef APP-ANDROID
import { renderIcon } from '@/uni_modules/aio-native-icons'
// #endif
const nativeImages = new Map<string, string>()

export function iconSource(svg: string, size = 24) {
  // #ifdef APP-ANDROID
  // 当前 Vapor 的 Android 图像解码器不能显示 SVG，由原生 Canvas 渲染为透明 PNG。
  const pixels = Math.min(512, Math.max(96, Math.ceil(size * 3)))
  const key = pixels + ':' + svg
  const cached = nativeImages.get(key)
  if (cached) return cached
  try {
    const source = renderIcon(svg, pixels)
    if (source) {
      if (nativeImages.size >= 256) nativeImages.clear()
      nativeImages.set(key, source)
      return source
    }
  } catch (_) {
    console.warn('原生图标渲染失败')
  }
  // #endif
  const bytes = new Uint8Array(svg.length)
  for (let i = 0; i < svg.length; i++) bytes[i] = svg.charCodeAt(i)
  return 'data:image/svg+xml;base64,' + uni.arrayBufferToBase64(bytes.buffer)
}
