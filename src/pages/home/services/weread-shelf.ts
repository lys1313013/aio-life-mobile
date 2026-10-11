import spacing from '../../../styles/spacing.json'
import typography from '../../../styles/typography.json'

// 封面 2:3、书架列宽是图像/文字容纳约束；普通留白和排版来自公共配置。
export function wereadShelfWidth(viewportWidth: number, tablet = false) {
  const availableWidth = Math.max(0, viewportWidth - spacing.card * 2)
  // 平板两排使用横向书目，需要给书名和阅读时间留出宽度。
  const minColumnWidth = tablet ? 150 : 112
  // 列间距与卡片右内边距相同，下一列从视口边缘开始，不露出窄边。
  const visibleColumns = Math.max(tablet ? 2 : 3, Math.floor((availableWidth + spacing.card) / (minColumnWidth + spacing.card)))
  const columnWidth = Math.max(0, (availableWidth - spacing.card * (visibleColumns - 1)) / visibleColumns)
  return { visibleColumns, columnWidth }
}
const minCoverHeight = 96
const maxCoverHeight = 144
const cardInset = spacing.controlMin + spacing.card + spacing.hairline * 2
const textHeight = typography.roles.label.lineHeight + typography.roles.caption.lineHeight + spacing.inline + spacing.detail
const minItemHeight = minCoverHeight + textHeight

export function wereadShelfLayout(height: number | undefined, maxHeight: number, tablet = false) {
  const bodyHeight = Math.max(0, Math.min(height || minItemHeight + cardInset, maxHeight) - cardInset)
  const rows = tablet ? 2 : Math.max(1, Math.floor((bodyHeight + spacing.section) / (minItemHeight + spacing.section)))
  const itemHeight = (bodyHeight - (tablet ? spacing.detail : spacing.section) * (rows - 1)) / rows
  const coverHeight = tablet ? Math.max(0, Math.min(88, itemHeight)) : Math.max(0, Math.min(maxCoverHeight, itemHeight - textHeight))
  return { bodyHeight, rows, itemHeight, coverHeight, coverWidth: coverHeight * 2 / 3 }
}

export function wereadShelfColumns<T>(books: T[], rows: number): T[][] {
  const columns: T[][] = []
  for (let index = 0; index < books.length; index += rows) columns.push(books.slice(index, index + rows))
  return columns
}
