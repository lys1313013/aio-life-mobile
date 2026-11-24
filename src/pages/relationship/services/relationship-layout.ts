export type GraphNode = { id: string; name: string; category?: string };
export type GraphEdge = { source: string; target: string; relationType: string; direction?: string };
export type GraphPathSegment = { x: number; y: number; dx: number; dy: number; length: number; angle: number };
export type GraphPath = GraphEdge & {
  index: number; length: number; segments: GraphPathSegment[];
  labelX: number; labelY: number; showLabel: boolean;
};

// 画布配色与 Web 的人物圆点一致。
const categoryColors: Record<string, string[]> = {
  亲属: ['#ad5046', '#e99a8c'], 社会: ['#2e5687', '#91b7f4'],
  情感: ['#8b5944', '#dbad91'], 其他: ['#537656', '#92b89b'],
};
export function categoryColor(category: string | undefined, dark: boolean) {
  return (categoryColors[category ?? ''] ?? ['#5f6b79', '#b0bacb'])[dark ? 1 : 0];
}
const oneWayTypes = new Set(['mentor', '子女', '学生', '暗恋', '母亲', '父亲', '父母', '老师']);
export function isBidirectional(edge: GraphEdge) {
  return (edge.direction || '双向') === '双向' && !oneWayTypes.has(edge.relationType);
}
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
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], viewportWidth: number, viewportHeight: number) {
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
    const orbit = [0.94, 1.04, 0.89, 1.01][index % 4];
    return {
      ...node, x: width / 2 + (index ? Math.cos(angle) * rx * orbit : 0),
      y: height / 2 + (index ? Math.sin(angle) * ry * orbit : 0),
      radius: !index && sorted.length > 2 ? 8 : (degree.get(node.id)?.size ?? 0) >= 3 ? 6 : 4,
    };
  });
  // 除主节点外，彼此有关联的人物围成小圈，避免所有人物排成一圈。
  const ungrouped = new Map(positioned.slice(1).map(node => [node.id, node]));
  for (const anchor of positioned.slice(1)) {
    if (!ungrouped.has(anchor.id)) continue;
    const members = [...(degree.get(anchor.id) ?? [])]
      .filter(id => id !== anchor.id && ungrouped.has(id));
    if (!members.length) continue;
    ungrouped.delete(anchor.id);
    anchor.radius = Math.max(anchor.radius, 6);
    const outward = Math.atan2(anchor.y - height / 2, anchor.x - width / 2);
    const radius = Math.min(110, 64 + members.length * 7);
    for (const [index, id] of members.entries()) {
      const member = ungrouped.get(id)!;
      const angle = outward + (index - (members.length - 1) / 2) * Math.PI / Math.max(2, members.length);
      member.x = Math.max(40, Math.min(width - 40, anchor.x + Math.cos(angle) * radius));
      member.y = Math.max(35, Math.min(height - 35, anchor.y + Math.sin(angle) * radius));
      ungrouped.delete(id);
    }
  }
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

type PositionedNode = GraphNode & { x: number; y: number; radius: number };
function segment(x: number, y: number, dx: number, dy: number): GraphPathSegment {
  return { x, y, dx, dy, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

function loopSegments(node: PositionedNode) {
  const segments: GraphPathSegment[] = [];
  const inset = node.radius / Math.SQRT2;
  let x = node.x + inset, y = node.y - inset;
  for (let step = 1; step <= 24; step++) {
    const t = step / 24, remaining = 1 - t;
    const start = remaining ** 3, end = t ** 3, control = 3 * remaining * t;
    const nextX = node.x + inset * (start - end) + 55 * control * (remaining - t);
    const nextY = node.y - inset * (start + end) - 60 * control;
    segments.push(segment(x, y, nextX - x, nextY - y));
    x = nextX;
    y = nextY;
  }
  return segments;
}

export function layoutEdges(nodes: PositionedNode[], edges: GraphEdge[]): GraphPath[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const occupied = nodes.map(node => ({ x: node.x, y: node.y, halfWidth: 38, halfHeight: 27 }));
  return edges.flatMap((edge, index) => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) return [];
    if (source.id === target.id) {
      const segments = loopSegments(source);
      return [{ ...edge, index, segments, length: segments.reduce((sum, item) => sum + item.length, 0), labelX: 0, labelY: 0, showLabel: false }];
    }
    const dx = target.x - source.x, dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    const total = Math.max(distance, source.radius + target.radius);
    const start = source.radius / total, span = Math.max(0, 1 - start - target.radius / total);
    const line = segment(source.x + dx * start, source.y + dy * start, dx * span, dy * span);
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
    return [{ ...edge, index, segments: [line], length: line.length, labelX, labelY, showLabel }];
  });
}
