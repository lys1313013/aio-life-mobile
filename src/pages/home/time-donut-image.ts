import { summaryDonutLabels, summaryDonutRotation } from '../../services/dashboard-format.ts'

type Group = { id: string; color: string; minutes: number }

function attribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function point(radius: number, angle: number) {
  return `${88 + Math.cos(angle) * radius},${88 + Math.sin(angle) * radius}`
}

// 微信用普通 image 显示完整矢量图，不创建会与 scroll-view 脱离的 Canvas 层。
// 与其他端共用 176px 坐标系、旋转角和标签引导线，内外半径仍为 35 / 54。
export function timeDonutImage(groups: Group[], dark: boolean) {
  const rows = groups.filter(group => group.minutes > 0)
  const total = rows.reduce((sum, group) => sum + group.minutes, 0)
  const color = rows[0]?.color || (dark ? '#45474d' : '#c9c9cc')
  // 完整底环消除扇区的抗锯齿接缝，也处理单分类 360° 和空态。
  let body = `<circle cx="88" cy="88" r="44.5" fill="none" stroke="${attribute(color)}" stroke-width="19"/>`
  let start = -Math.PI / 2 + summaryDonutRotation(groups)
  if (rows.length > 1) {
    for (const row of rows) {
      const end = start + row.minutes / total * Math.PI * 2
      const large = end - start > Math.PI ? 1 : 0
      const path = `M${point(54, start)} A54,54 0 ${large},1 ${point(54, end)}`
        + ` L${point(35, end)} A35,35 0 ${large},0 ${point(35, start)} Z`
      body += `<path d="${path}" fill="${attribute(row.color)}"/>`
      start = end
    }
  }
  for (const label of summaryDonutLabels(groups)) {
    const points = label.points.map(p => `${p.x},${p.y}`).join(' ')
    body += `<polyline points="${points}" fill="none" stroke="${attribute(label.color)}" stroke-width="1"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176" viewBox="0 0 176 176">${body}</svg>`
}
