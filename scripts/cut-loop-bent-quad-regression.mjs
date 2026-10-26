// Cut loop crosses quads that are slightly bent (their two triangles are not
// coplanar). It used to stop in the first triangle and run to its far corner,
// drawing a diagonal line instead of a loop around the object.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent',
});
try {
  globalThis.window = { self: {}, top: {} };
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { buildCutLoopPlan, applyCutLoopPlan } = await server.ssrLoadModule('/src/lib/cutTools.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
  // A square tube, 8 long, whose far end is twisted 12 degrees: every side
  // quad is bent, stored as two triangles with a hidden diagonal.
  const m = new EditableMesh('bent tube');
  let id = 700000;
  const ring = (x, twist, size) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([y, z]) => {
    const c = Math.cos(twist), s = Math.sin(twist);
    const v = { id: id++, x, y: (y * c - z * s) * size, z: (y * s + z * c) * size };
    m.vertices.push(v);
    return v.id;
  });
  const r0 = ring(0, 0, 1), r1 = ring(8, 12 * Math.PI / 180, 0.6);
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    m.faces.push([r0[k], r0[k2], r1[k2]], [r0[k], r1[k2], r1[k]]);
  }
  m.faces.push([...r0].reverse(), [...r1]);
  m.invalidateCache();
  const shown = new Set(m.getEdges().map((e) => edgeKey(e.v1, e.v2)));
  for (let k = 0; k < 4; k++) assert.ok(!shown.has(edgeKey(r0[k], r1[(k + 1) % 4])), 'side diagonals are hidden');
  // Cut across the tube from a lengthwise edge.
  const plan = buildCutLoopPlan(m, r0[0], r1[0], 0.5);
  assert.equal(plan.segments.filter((s) => s.end != null).length, 0, 'the cut never runs to a corner');
  assert.equal(plan.segments.filter((s) => s.loop).length, 4, 'the cut crosses all four sides');
  const before = m.faces.length;
  applyCutLoopPlan(m, plan);
  assert.equal(m.faces.length, before - 4 + 4, 'each side quad is split in two');
  console.log('Cut loop goes all the way round bent quads.');
} finally {
  await server.close();
}
