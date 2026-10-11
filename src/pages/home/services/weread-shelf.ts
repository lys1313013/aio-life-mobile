import spacing from '../../../styles/spacing.json'
import typography from '../../../styles/typography.json'

// 封面 2:3、书架列宽是图像/文字容纳约束；普通留白和排版来自公共配置。
export function wereadShelfWidth(viewportWidth: number) {
  const availableWidth = Math.max(0, viewportWidth - spacing.card * 2)
  // 首屏至少三列；更宽的卡片继续增加列数，避免再次把空白分给两本书。
  const visibleColumns = Math.max(3, Math.floor((availableWidth + spacing.inline) / (112 + spacing.inline)))
  const columnWidth = Math.max(0, (availableWidth - spacing.inline * (visibleColumns - 1)) / visibleColumns)
  return { visibleColumns, columnWidth }
}
const minCoverHeight = 96
const maxCoverHeight = 144
const cardInset = spacing.controlMin + spacing.card + spacing.hairline * 2
const textHeight = typography.roles['label-strong'].lineHeight + typography.roles.caption.lineHeight + spacing.inline + spacing.detail
const minItemHeight = minCoverHeight + textHeight

export function wereadShelfLayout(height: number | undefined, maxHeight: number) {
  const bodyHeight = Math.max(0, Math.min(height || minItemHeight + cardInset, maxHeight) - cardInset)
  const rows = Math.max(1, Math.floor((bodyHeight + spacing.section) / (minItemHeight + spacing.section)))
  const itemHeight = (bodyHeight - spacing.section * (rows - 1)) / rows
  const coverHeight = Math.max(0, Math.min(maxCoverHeight, itemHeight - textHeight))
  return { bodyHeight, rows, itemHeight, coverHeight, coverWidth: coverHeight * 2 / 3 }
}

export function wereadShelfColumns<T>(books: T[], rows: number): T[][] {
  const columns: T[][] = []
  for (let index = 0; index < books.length; index += rows) columns.push(books.slice(index, index + rows))
  return columns
}
