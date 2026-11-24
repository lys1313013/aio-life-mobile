import type { GraphPath } from './relationship-layout.ts';
import { isBidirectional } from './relationship-layout.ts';

type Exit = { index: number; line: string; reverse: boolean };
type Dot = { exit: Exit; distance: number; arrived: boolean };
export type GraphDot = { x: number; y: number; target: string };

const dotSpeed = 20; // CSS 像素/秒，与 Web 图谱一致。
const maxDots = 10;
const nodesPerDot = 3;

export function createRelationshipMotion(random = Math.random) {
  const paths = new Map<number, GraphPath>();
  const exits = new Map<string, Exit[]>();
  let dots: Dot[] = [];

  function pick<T>(items: T[]) {
    return items[Math.floor(random() * items.length)];
  }

  function addExit(node: string, exit: Exit) {
    const options = exits.get(node);
    if (options) options.push(exit);
    else exits.set(node, [exit]);
  }

  function setPaths(edges: GraphPath[], restart: boolean) {
    paths.clear();
    exits.clear();
    const available = new Map<string, Exit>();
    const connected = new Set<string>();
    for (const edge of edges) {
      paths.set(edge.index, edge);
      connected.add(edge.source);
      connected.add(edge.target);
      const line = JSON.stringify([edge.source, edge.target].sort());
      const forward = { index: edge.index, line, reverse: false };
      available.set(line, forward);
      addExit(edge.source, forward);
      if (edge.source !== edge.target && isBidirectional(edge)) {
        addExit(edge.target, { index: edge.index, line, reverse: true });
      }
    }
    const count = Math.min(Math.ceil(connected.size / nodesPerDot), maxDots, available.size);
    dots = restart ? [] : dots.filter(dot => paths.has(dot.exit.index)).slice(0, count);
    for (const dot of dots) available.delete(dot.exit.line);
    const unused = [...available.values()];
    while (dots.length < count) {
      const [exit] = unused.splice(Math.floor(random() * unused.length), 1);
      dots.push({ exit, distance: 0, arrived: false });
    }
  }

  function nextExit(previous: Exit, node: string, occupied: Set<string>) {
    const options = exits.get(node) ?? [];
    const onward = options.filter(exit => exit.line !== previous.line);
    const next = pick((onward.length ? onward : options).filter(exit => !occupied.has(exit.line)));
    if (next) return next;

    // 出口占满或到达单向尽头时，在另一个有空闲出口的节点重新出发。
    const starts: Exit[][] = [];
    for (const [id, adjacent] of exits) {
      if (id === node) continue;
      const free = adjacent.filter(exit => !occupied.has(exit.line));
      if (free.length) starts.push(free);
    }
    const start = pick(starts);
    return start ? pick(start) : { ...previous, reverse: false };
  }

  function step(elapsed: number, zoom: number): GraphDot[] {
    const occupied = new Set(dots.map(dot => dot.exit.line));
    return dots.map(dot => {
      let path = paths.get(dot.exit.index)!;
      if (dot.arrived) {
        occupied.delete(dot.exit.line);
        dot.exit = nextExit(dot.exit, dot.exit.reverse ? path.source : path.target, occupied);
        occupied.add(dot.exit.line);
        dot.distance = 0;
        path = paths.get(dot.exit.index)!;
      }
      const total = path.length * zoom;
      dot.distance = Math.min(total, dot.distance + elapsed * dotSpeed / 1000);
      dot.arrived = dot.distance === total;
      const travelled = dot.distance / zoom;
      let remaining = dot.exit.reverse ? path.length - travelled : travelled;
      for (const segment of path.segments) {
        if (remaining <= segment.length || segment === path.segments[path.segments.length - 1]) {
          const ratio = segment.length > 0 ? Math.min(1, remaining / segment.length) : 0;
          return { x: segment.x + segment.dx * ratio, y: segment.y + segment.dy * ratio, target: dot.exit.reverse ? path.source : path.target };
        }
        remaining -= segment.length;
      }
      return { x: 0, y: 0, target: path.target };
    });
  }

  return { setPaths, step };
}
