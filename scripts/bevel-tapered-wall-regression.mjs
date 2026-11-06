import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Beveling a loop that runs around a tapered wall (a cup, a cone, a pyramid
// frustum) must keep every new vertex on the wall. Following the bisector of
// the two faces at each corner instead tipped the rails off the wall, pulling
// the band straight up and down and kinking the taper.
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent' });
try {
  globalThis.window = { self: {}, top: {} };
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { bevelLoopEdges } = await server.ssrLoadModule('/src/lib/bevelLoop.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');

  // Narrow at the bottom, wide at the top, with a loop around the middle.
  const size = (y) => 6 + 3 * y / 20;
  const ys = [0, 10, 20];
  const run = (sides, label) => {
    const m = new EditableMesh(`taper-${sides}`);
    let id = 980000 + sides * 100;
    const add = (x, y, z) => { m.vertices.push({ id, x, y, z }); return id++; };
    // A square frustum is measured by half-width; a round one by radius.
    const scale = sides === 4 ? Math.SQRT2 : 1;
    const rings = ys.map((y) => Array.from({ length: sides }, (_, j) => {
      const a = (2 * Math.PI * j) / sides + (sides === 4 ? Math.PI / 4 : 0);
      return add(Math.cos(a) * size(y) * scale, y, Math.sin(a) * size(y) * scale);
    }));
    for (let i = 0; i < 2; i++) for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      m.faces.push([rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]]);
    }
    m.faces.push([...rings[0]], [...rings[2]].reverse());
    m.invalidateCache();
    const keys = new Set(rings[1].map((v, j) => edgeKey(v, rings[1][(j + 1) % sides])));
    const indices = m.getEdges().map((e, i) => (keys.has(edgeKey(e.v1, e.v2)) ? i : -1)).filter((i) => i >= 0);
    assert.equal(indices.length, sides);
    const sm = { selection: { meshId: m.id, type: 'edge', indices }, meshes: [m], getMesh: () => m, setSelection(s) { this.selection = s; }, clearSelection() {}, rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    const before = new Set(m.vertices.map((v) => v.id));
    bevelLoopEdges(sm, { radius: 3.75, segments: 4, smooth: true, sweep: false });
    const added = m.vertices.filter((v) => !before.has(v.id));
    assert.ok(added.length >= sides * 5, `${label}: bevel must build its rings`);
    // On the wall, a vertex sits exactly on the taper for its height.
    for (const v of m.vertices) {
      if (v.y < 1e-6 || v.y > 20 - 1e-6) continue;
      const out = sides === 4 ? Math.max(Math.abs(v.x), Math.abs(v.z)) : Math.hypot(v.x, v.z);
      assert.ok(Math.abs(out - size(v.y)) < 1e-6, `${label}: vertex at height ${v.y.toFixed(3)} left the tapered wall (${out.toFixed(4)} vs ${size(v.y).toFixed(4)})`);
    }
    // The bevel spreads the entered distance up and down the wall.
    const heights = added.map((v) => v.y);
    // The wall's own slope, measured across a face (its apothem for a round one).
    const slope = (3 / 20) * (sides === 4 ? 1 : Math.cos(Math.PI / sides));
    const along = 3.75 / Math.hypot(1, slope);
    assert.ok(Math.abs(Math.max(...heights) - (10 + along)) < 1e-6 && Math.abs(Math.min(...heights) - (10 - along)) < 1e-6, `${label}: bevel must reach the entered distance up and down the wall`);
    const counts = new Map();
    for (const f of m.faces) for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    assert.ok([...counts.values()].every((n) => n === 2), `${label}: bevel must stay manifold`);
  };
  run(4, 'square frustum');
  run(24, 'round frustum');

  // The same with the app's own primitives: a cube and a cylinder made wider
  // at the top, cut with a loop around the middle, then beveled.
  const { createPrimitive } = await server.ssrLoadModule('/src/lib/primitives.js');
  const { buildCutLoopPlan, applyCutLoopPlan } = await server.ssrLoadModule('/src/lib/cutTools.js');
  for (const type of ['cube', 'cylinder']) {
    const m = createPrimitive(type, 12);
    const wide = (y) => 1 + (y + 0.5) * 0.6; // bottom at y=-0.5 keeps its size
    const base = new Map(m.vertices.map((v) => [v.id, Math.hypot(v.x, v.z)]));
    for (const v of m.vertices) { const k = wide(v.y); v.x *= k; v.z *= k; }
    m.invalidateCache();
    const wall = m.getEdges().find((e) => {
      const a = m.getVertex(e.v1), b = m.getVertex(e.v2);
      return Math.abs(Math.abs(a.y - b.y) - 1) < 1e-6 && base.get(e.v1) > 0.3;
    });
    assert.ok(wall, `${type}: needs a wall edge to cut`);
    applyCutLoopPlan(m, buildCutLoopPlan(m, wall.v1, wall.v2, 0.5));
    m.invalidateCache();
    const loop = m.getEdges().map((e, i) => {
      const a = m.getVertex(e.v1), b = m.getVertex(e.v2);
      return Math.abs(a.y) < 1e-6 && Math.abs(b.y) < 1e-6 ? i : -1;
    }).filter((i) => i >= 0);
    assert.ok(loop.length >= 4, `${type}: the cut makes a loop`);
    // How far out a point is once the taper is taken away again.
    const untapered = (v) => Math.hypot(v.x, v.z) / wide(v.y);
    const radii = m.vertices.filter((v) => Math.abs(v.y) < 1e-6).map(untapered);
    const sm = { selection: { meshId: m.id, type: 'edge', indices: loop }, meshes: [m], getMesh: () => m, setSelection(s) { this.selection = s; }, clearSelection() {}, rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    const known = new Set(m.vertices.map((v) => v.id));
    bevelLoopEdges(sm, { radius: 0.15, segments: 4, smooth: true, sweep: false });
    const added = m.vertices.filter((v) => !known.has(v.id));
    assert.ok(added.length >= loop.length * 5, `${type}: bevel must build its rings`);
    // With the taper taken away, every bevel vertex sits exactly as far out
    // as a loop vertex: it stayed on the tapered wall.
    for (const v of added) {
      const r = untapered(v);
      assert.ok(radii.some((want) => Math.abs(r - want) < 1e-5), `${type}: bevel vertex at height ${v.y.toFixed(4)} left the tapered wall`);
    }
  }
  console.log('PASS: bevel around a tapered wall keeps the wall straight');
} finally { await server.close(); }
