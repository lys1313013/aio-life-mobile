/** Only replace visible slots; disabled/unavailable cards retain their saved positions. */
export function mergeVisibleCardOrder(items, group, visibleKeys) {
  const keys = items.filter(item => item.group === group).sort((a, b) => a.sortOrder - b.sortOrder).map(item => item.cardKey)
  const visible = new Set(visibleKeys)
  if (visible.size !== visibleKeys.length || visibleKeys.some(key => !keys.includes(key))) throw new Error('卡片列表已变化，请重试')
  let index = 0
  return keys.map(key => visible.has(key) ? visibleKeys[index++] : key)
}

/** Hit-test measured cells, supporting multiple columns and unequal card heights. */
export function closestCard(rects, x, y) {
  const containing = rects.find(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
  if (containing) return containing.key
  return [...rects].sort((a, b) => {
    const distance = rect => Math.pow(x - Math.max(rect.left, Math.min(rect.right, x)), 2) + Math.pow(y - Math.max(rect.top, Math.min(rect.bottom, y)), 2)
    return distance(a) - distance(b)
  })[0]?.key || ''
}

/** Insert before/after the hovered card according to the pointer's half of its slot. */
export function cardDropIndex(rects, key, x, y) {
  const from = rects.findIndex(rect => rect.key === key)
  const hovered = closestCard(rects, x, y)
  const index = rects.findIndex(rect => rect.key === hovered)
  if (from < 0 || index < 0 || index === from) return from
  const cell = rects[index], source = rects[from]
  const sameRow = Math.abs(cell.top - source.top) < 1
  const position = sameRow ? x : y
  const middle = sameRow ? (cell.left + cell.right) / 2 : (cell.top + cell.bottom) / 2
  const before = position < middle || (Math.abs(position - middle) < 1 && from > index)
  return Math.max(0, Math.min(rects.length - 1, index + (before ? 0 : 1) - (from < index ? 1 : 0)))
}

/** Match the real wrapping flex layout, including unequal card heights and row gaps. */
export function projectCardLayout(rects, keys) {
  if (!rects.length) return []
  const top = Math.min(...rects.map(rect => rect.top))
  const columns = rects.filter(rect => Math.abs(rect.top - top) < 1).sort((a, b) => a.left - b.left)
  const firstBottom = Math.max(...columns.map(rect => rect.bottom))
  const nextRow = rects.filter(rect => rect.top > top + 1)
  const gap = nextRow.length ? Math.max(0, Math.min(...nextRow.map(rect => rect.top)) - firstBottom) : 0
  const byKey = new Map(rects.map(rect => [rect.key, rect]))
  let rowTop = top, rowHeight = 0
  return keys.map((key, index) => {
    const column = index % columns.length, cell = byKey.get(key), slot = columns[column]
    if (column === 0 && index > 0) { rowTop += rowHeight + gap; rowHeight = 0 }
    rowHeight = Math.max(rowHeight, cell.height)
    return { ...cell, left: slot.left, right: slot.right, width: slot.width, top: rowTop, bottom: rowTop + cell.height }
  })
}
