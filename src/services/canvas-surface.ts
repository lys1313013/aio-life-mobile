/** 业务绘图始终使用逻辑像素；App backing store 由原生布局管理。 */
export function configureCanvasSurface(context: any, width: number, height: number) {
  // #ifndef APP
  const ratio = uni.getWindowInfo().pixelRatio || 1
  context.canvas.width = Math.round(width * ratio)
  context.canvas.height = Math.round(height * ratio)
  // #endif
  context.setTransform(context.canvas.width / width, 0, 0, context.canvas.height / height, 0, 0)
}

export function reduceCanvasMotion() {
  // #ifdef WEB
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // #endif
  // 原生首帧直接绘制最终形态，与小程序图片及外部文字标签同步。
  // #ifndef WEB
  return true
  // #endif
}
