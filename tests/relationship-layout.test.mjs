import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile(new URL('../src/pages/relationship/services/relationship-layout.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { layoutGraph, layoutEdges } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

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
