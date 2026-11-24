// Beveling only the lower part of a corner that carries on above (a box
// corner split by a loop cut, or a corner with an extra point on it) bevels
// just that part: the corner above stays sharp and straight, the cut is closed
// at its top, and the surface stays closed. The corner above used to be dragged
// onto the bevel, tapering it all the way up.
import * as THREE from 'three';
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
  const { bevelLoopEdges } = await server.ssrLoadModule('/src/lib/bevelLoop.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
  const H = 4, CUT = 0.5, W = 0.15;
  const run = (kind, segments) => {
    const m = new EditableMesh('column');
    let id = 920000;
    const ids = new Map();
    const P = (x, y, z) => {
      const k = `${x},${y},${z}`;
      if (!ids.has(k)) { ids.set(k, id); m.vertices.push({ id, x, y, z }); id++; }
      return ids.get(k);
    };
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    m.faces.push(corners.map(([x, z]) => P(x, 0, z)));
    m.faces.push(corners.map(([x, z]) => P(x, H, z)).reverse());
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = corners[i], [x2, z2] = corners[(i + 1) % 4];
      if (kind === 'quads') {
        m.faces.push([P(x1, 0, z1), P(x2, 0, z2), P(x2, CUT, z2), P(x1, CUT, z1)]);
        m.faces.push([P(x1, CUT, z1), P(x2, CUT, z2), P(x2, H, z2), P(x1, H, z1)]);
      } else {
        const split = (x, z) => x === 0.5 && z === 0.5;
        const f = [P(x1, 0, z1), P(x2, 0, z2)];
        if (split(x2, z2)) f.push(P(x2, CUT, z2));
        f.push(P(x2, H, z2), P(x1, H, z1));
        if (split(x1, z1)) f.push(P(x1, CUT, z1));
        m.faces.push(f);
      }
    }
    // Wind every face outward.
    const at = (vid) => { const v = m.getVertex(vid); return new THREE.Vector3(v.x, v.y, v.z); };
    m.faces = m.faces.map((f) => {
      const n = new THREE.Vector3();
      f.forEach((a, j) => { const p = at(a), q = at(f[(j + 1) % f.length]); n.x += (p.y - q.y) * (p.z + q.z); n.y += (p.z - q.z) * (p.x + q.x); n.z += (p.x - q.x) * (p.y + q.y); });
      const c = f.reduce((s, a) => s.add(at(a)), new THREE.Vector3()).divideScalar(f.length).sub(new THREE.Vector3(0, H / 2, 0));
      return n.dot(c) < 0 ? [...f].reverse() : f;
    });
    m.invalidateCache();
    const bottom = P(0.5, 0, 0.5), mid = P(0.5, CUT, 0.5), top = P(0.5, H, 0.5);
    const index = m.getEdges().findIndex((e) => edgeKey(e.v1, e.v2) === edgeKey(bottom, mid));
    const sm = { selection: { meshId: m.id, type: 'edge', indices: [index] }, meshes: [m], getMesh: () => m,
      setSelection(sel) { this.selection = sel; }, clearSelection() {}, rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    bevelLoopEdges(sm, { radius: W, segments, smooth: true, sweep: false });
    const directed = new Map();
    for (const f of m.faces) for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      const k = edgeKey(a, b);
      const e = directed.get(k) || { n: 0, d: 0 };
      e.n++; e.d += a < b ? 1 : -1;
      directed.set(k, e);
    }
    let volume = 0;
    for (const f of m.faces) {
      const a = at(f[0]);
      for (let j = 1; j < f.length - 1; j++) volume += a.dot(new THREE.Vector3().crossVectors(at(f[j]), at(f[j + 1]))) / 6;
    }
    const midVertex = m.getVertex(mid);
    return { directed: [...directed.values()], volume, midVertex, cornerAbove: directed.has(edgeKey(mid, top)) };
  };
  for (const kind of ['quads', 'ngon']) {
    for (const segments of [1, 3]) {
      const name = `${kind}, ${segments} segment(s)`;
      const res = run(kind, segments);
      assert.ok(res.directed.every((e) => e.n === 2 && e.d === 0), name + ': closed, every face facing out');
      assert.ok(res.midVertex && res.midVertex.x === 0.5 && res.midVertex.y === CUT && res.midVertex.z === 0.5, name + ': the corner point above the bevel stays');
      assert.ok(res.cornerAbove, name + ': the corner above the bevel stays one straight edge');
      // Only the beveled part loses material: at most the chamfer's triangle
      // (W²/2) along the beveled length, and a little less with a rounded profile.
      const removed = 4 - res.volume;
      assert.ok(removed > 0 && removed <= (W * W / 2) * CUT + 1e-9, name + `: only the beveled part is cut (removed ${removed})`);
    }
  }
  console.log('Beveling part of a corner leaves the rest of the corner sharp and the surface closed.');
} finally {
  await server.close();
}
