// 与 Web 图谱保持一致的分类及关系配色。
export const categoryColors: Record<string, string> = {
  亲属: '#f43f5e', 社会: '#3b82f6', 情感: '#a855f7', 其他: '#94a3b8',
};
const relationColors: Record<string, string> = {
  父母: '#e91e63', 母亲: '#e91e63', 父亲: '#e91e63', 子女: '#4caf50',
  配偶: '#ff9800', 恋人: '#ff5722', 兄弟姐妹: '#9c27b0', 朋友: '#2196f3',
  挚友: '#00bcd4', 同学: '#009688', 同事: '#607d8b', 老师: '#795548',
  学生: '#8bc34a', mentor: '#3f51b5', 前任: '#f44336', 暗恋: '#e91e63',
};
export function relationColor(type: string, dark = false) {
  const color = relationColors[type] || '#8392a5';
  if (!dark) return color;
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  return '#' + rgb.map(value => Math.round(value + (255 - value) * 0.28).toString(16).padStart(2, '0')).join('');
}

// 坐标、节点宽高和碰撞边界属于画布几何，普通 UI 间距仍取 spacing.json。
export function layoutGraph(nodes: any[], edges: any[], viewportWidth: number, viewportHeight: number) {
  const degree = new Map<string, Set<string>>();
  for (const edge of edges) {
    for (const [source, target] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!degree.has(source)) degree.set(source, new Set());
      degree.get(source)!.add(target);
    }
  }
  const sorted = [...nodes].sort((a, b) => (degree.get(b.id)?.size || 0) - (degree.get(a.id)?.size || 0));
  const count = Math.max(1, sorted.length - 1);
  // 大图扩展世界坐标而不缩小文字及点击区，仍可拖动、缩放和复位。
  const width = Math.max(viewportWidth, count * 23 + 96);
  const height = Math.max(viewportHeight, count * 34 + 72);
  const rx = Math.min(width / 2 - 48, Math.max(140, count * 12, viewportWidth * 0.32));
  const ry = Math.min(height / 2 - 36, Math.max(150, count * 17));
  const positioned = sorted.map((node, index) => {
    const angle = -Math.PI / 2 + Math.PI / count + (index - 1) * Math.PI * 2 / count;
    return { ...node, x: width / 2 + (index ? Math.cos(angle) * rx : 0), y: height / 2 + (index ? Math.sin(angle) * ry : 0) };
  });
  // 保护长姓名的固定宽度节点；细长视口及奇数节点同样保留可读间距。
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (let i = 0; i < positioned.length; i++) for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i], b = positioned[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) >= 76 || Math.abs(dy) >= 54) continue;
      const shift = (54 - Math.abs(dy)) / 2;
      const direction = dy >= 0 ? 1 : -1;
      a.y -= shift * direction;
      b.y += shift * direction;
      changed = true;
    }
    if (!changed) break;
  }
  return { width, height, nodes: positioned };
}

export function layoutEdges(nodes: any[], edges: any[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const occupied = nodes.map(node => ({ x: node.x, y: node.y, halfWidth: 38, halfHeight: 27 }));
  return edges.flatMap(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || source.id === target.id) return [];
    const dx = target.x - source.x, dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    // 将线端裁在人物胶囊外缘，箭头不穿过姓名。
    const cut = Math.min(36 / Math.max(Math.abs(dx), 0.001), 24 / Math.max(Math.abs(dy), 0.001));
    const x = source.x + dx * cut, y = source.y + dy * cut;
    const length = Math.max(0, distance * (1 - 2 * cut));
    const halfWidth = Math.max(16, String(edge.relationType || '').length * 6 + 4);
    let labelX = 0, labelY = 0, showLabel = false;
    for (const t of [0.5, 0.65, 0.35, 0.78, 0.22]) {
      labelX = source.x + dx * t;
      labelY = source.y + dy * t;
      if (occupied.some(box => Math.abs(labelX - box.x) < halfWidth + box.halfWidth && Math.abs(labelY - box.y) < 11 + box.halfHeight)) continue;
      occupied.push({ x: labelX, y: labelY, halfWidth, halfHeight: 11 });
      showLabel = true;
      break;
    }
    return [{ ...edge, x, y, length, angle: Math.atan2(dy, dx) * 180 / Math.PI, labelX, labelY, showLabel }];
  });
}
