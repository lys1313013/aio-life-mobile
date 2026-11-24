import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
const source = await readFile(new URL('../src/pages/relationship/services/relationship-layout.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { layoutGraph, layoutEdges } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const motionBundle = await build({
  entryPoints: [new URL('../src/pages/relationship/services/relationship-motion.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', write: false,
});
const { createRelationshipMotion } = await import('data:text/javascript;base64,' + Buffer.from(motionBundle.outputFiles[0].text).toString('base64'));

for (const count of [0, 1, 2, 3, 13, 30]) {
  test(`relationship layout keeps ${count} nodes readable and IDs intact`, () => {
    const nodes = Array.from({ length: count }, (_, i) => ({ id: String(9223372036854775800n + BigInt(i)), name: '模拟人物' + i }));
    const edges = nodes.slice(1).map(node => ({ source: nodes[0].id, target: node.id, relationType: '兄弟姐妹' }));
    const original = JSON.stringify(nodes);
    const graph = layoutGraph(nodes, edges, 366, 440);
    assert.equal(graph.nodes.length, count);
    assert.equal(JSON.stringify(nodes), original);
    for (let i=0; i<count; i++) {
      assert.equal(typeof graph.nodes[i].id, 'string');
      for (let j=i+1; j<count; j++) {
        const a=graph.nodes[i], b=graph.nodes[j];
        assert.ok(Math.abs(a.x-b.x)>=68 || Math.abs(a.y-b.y)>=44, `overlapping nodes ${i}/${j}`);
      }
    }
    const drawn = layoutEdges(graph.nodes, edges);
    assert.equal(drawn.length, edges.length);
    const labels = drawn.filter(edge => edge.showLabel);
    for (const edge of labels) {
      for (const node of graph.nodes) {
        assert.ok(Math.abs(edge.labelX-node.x)>=66 || Math.abs(edge.labelY-node.y)>=38);
      }
    }
    for (let i=0; i<labels.length; i++) for (let j=i+1; j<labels.length; j++) {
      assert.ok(Math.abs(labels[i].labelX-labels[j].labelX)>=56 || Math.abs(labels[i].labelY-labels[j].labelY)>=22);
    }
  });
}

const positioned = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 40, y: 0 },
  { id: 'c', x: 240, y: 0 },
  { id: 'd', x: 40, y: 240 },
  { id: 'e', x: 500, y: 0 },
  { id: 'f', x: 660, y: 0 },
  { id: 'g', x: 820, y: 0 },
].map(node => ({ ...node, name: node.id, radius: 4 }));
const directed = (source, target) => ({ source, target, relationType: '老师', direction: '单向' });

test('motion counts connected people, rounds up, and caps distinct lines at ten dots', () => {
  const people = Array.from({ length: 33 }, (_, index) => ({
    id: String(index), name: String(index), x: index * 80, y: 0, radius: 4,
  }));
  const motion = createRelationshipMotion(() => 0);
  for (const [connected, expected] of [[0, 0], [3, 1], [4, 2], [12, 4], [19, 7], [33, 10], [2, 1], [0, 0]]) {
    const edges = people.slice(1, Math.max(1, connected)).map(node => directed(people[0].id, node.id));
    motion.setPaths(layoutEdges(people, edges), false);
    for (let frame = 0; frame < 4; frame++) {
      const dots = motion.step(10000, 1);
      assert.equal(dots.length, expected);
      assert.equal(new Set(dots.map(dot => dot.target)).size, expected);
    }
  }
});

test('motion uses the same screen speed at different zoom levels', () => {
  for (const zoom of [0.5, 1, 2]) {
    const motion = createRelationshipMotion(() => 0);
    motion.setPaths(layoutEdges(positioned, [directed('b', 'c')]), true);
    const [first] = motion.step(0, zoom);
    const [second] = motion.step(1000, zoom);
    assert.equal((second.x - first.x) * zoom, 20);
  }
});

test('parallel relations and opposite directions occupy one visible line', () => {
  const motion = createRelationshipMotion(() => 0);
  motion.setPaths(layoutEdges(positioned, [
    directed('a', 'b'), directed('b', 'a'), directed('a', 'b'),
  ]), true);
  assert.equal(motion.step(100, 1).length, 1);
});

test('motion leaves by a free exit, or respawns immediately when every exit is occupied', () => {
  for (const blocked of [false, true]) {
    const motion = createRelationshipMotion(() => 0);
    const edges = [directed('a', 'b'), directed('b', 'c')];
    if (!blocked) edges.push(directed('d', 'c'));
    edges.push(directed('b', 'd'), directed('e', 'f'), directed('f', 'g'));
    motion.setPaths(layoutEdges(positioned, edges), true);
    assert.equal(motion.step(1600, 1)[0].x, 36);
    const next = motion.step(50, 1);
    assert.equal(next.length, 3);
    assert.deepEqual(next[0], blocked
      ? { x: 5, y: 0, target: 'b' }
      : { x: 40, y: 5, target: 'd' });
  }
});
