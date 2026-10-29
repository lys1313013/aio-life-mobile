// 与首页现有响应式断点一致；App 不支持 CSS @media，直接使用窗口宽度计算。
export function homeLayout(width: number) {
  return {
    overviewColumns: width >= 1200 ? 5 : width >= 768 ? 4 : 2,
    sectionColumns: width >= 1200 ? 3 : width >= 768 ? 2 : 1,
    overviewHeight: width >= 1200 ? 94 : width <= 480 ? 82 : 88,
  }
}
