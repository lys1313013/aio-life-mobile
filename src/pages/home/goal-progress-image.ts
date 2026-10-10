// 56px 进度环与原 Canvas 共用圆心、半径、线宽和十二点起点。
export function goalProgressImage(percent: number, color: string) {
  const value = Math.min(100, Math.max(0, percent))
  const circumference = Math.PI * 50
  const dash = value < 100
    ? ` stroke-dasharray="${circumference * value / 100} ${circumference}"`
    : ''
  const ring = value > 0
    ? `<circle cx="28" cy="28" r="25" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" transform="rotate(-90 28 28)"${dash}/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">${ring}</svg>`
}
