// Beveling one edge cuts into the corner and stays on the surrounding faces:
// the bevel's corners slide along the faces' border edges (a sloped top), and
// a sloped or domed end cap is not merged into one warped polygon. Both used
// to raise the area around the bevel.
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
  const run = ({ angle, slope = 0, dome = 0, tri = false }) => {
    const half = (angle / 2) * Math.PI / 180;
    const foot = [[0, 0], [3 * Math.sin(half), -3 * Math.cos(half)], [3 * Math.sin(half), -3 * Math.cos(half) - 2],
      [-3 * Math.sin(half), -3 * Math.cos(half) - 2], [-3 * Math.sin(half), -3 * Math.cos(half)]];
    const m = new EditableMesh('prism');
    let id = 810000;
    const add = (x, y, z) => { const v = { id: id++, x, y, z }; m.vertices.push(v); return v.id; };
    const topY = (z) => 2 + slope * z;
    const bot = foot.map(([x, z]) => add(x, 0, z));
    const top = foot.map(([x, z]) => add(x, topY(z), z));
    const n = foot.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (tri) m.faces.push([bot[i], bot[j], top[j]], [bot[i], top[j], top[i]]);
      else m.faces.push([bot[i], bot[j], top[j], top[i]]);
    }
    m.faces.push([...bot].reverse());
    if (dome) {
      const cx = foot.reduce((a, p) => a + p[0], 0) / n, cz = foot.reduce((a, p) => a + p[1], 0) / n;
      const c = add(cx, topY(cz) + dome, cz);
      for (let i = 0; i < n; i++) m.faces.push([top[i], top[(i + 1) % n], c]);
    } else m.faces.push([...top]);
    m.invalidateCache();
    const index = m.getEdges().findIndex((e) => edgeKey(e.v1, e.v2) === edgeKey(bot[0], top[0]));
    const sm = { selection: { meshId: m.id, type: 'edge', indices: [index] }, meshes: [m], getMesh: () => m,
      setSelection(sel) { this.selection = sel; }, clearSelection() {}, rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    const before = new Set(m.vertices.map((v) => v.id));
    bevelLoopEdges(sm, { radius: 0.3, segments: 3, smooth: true, sweep: false });
    const added = m.vertices.filter((v) => !before.has(v.id));
    const V = (vid) => { const v = m.getVertex(vid); return new THREE.Vector3(v.x, v.y, v.z); };
    const counts = new Map();
    for (const f of m.faces) for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]); counts.set(k, (counts.get(k) || 0) + 1);
    }
    const flat = m.faces.every((f) => {
      if (f.length < 4) return true;
      const ps = f.map(V);
      const nrm = new THREE.Vector3().subVectors(ps[1], ps[0]).cross(new THREE.Vector3().subVectors(ps[2], ps[0])).normalize();
      return ps.every((p) => Math.abs(nrm.dot(p.clone().sub(ps[0]))) < 1e-3);
    });
    const corner = new THREE.Vector3(0, topY(0), 0);
    const rimEnds = [foot[1], foot[n - 1]].map(([x, z]) => new THREE.Vector3(x, topY(z), z));
    const onRim = (p) => Math.min(...rimEnds.map((e) => {
      const ab = e.clone().sub(corner), ap = p.clone().sub(corner);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
      return ap.sub(ab.multiplyScalar(t)).length();
    }));
    const tops = added.filter((v) => v.y > 1).map((v) => new THREE.Vector3(v.x, v.y, v.z));
    const bottoms = added.filter((v) => Math.abs(v.y) < 1e-9).map((v) => Math.hypot(v.x, v.z));
    return { counts: [...counts.values()], flat, tops, onRim, corner, bottomSetback: Math.max(...bottoms) };
  };
  for (const c of [
    { angle: 100, slope: 0.3 }, { angle: 100, slope: 0.3, tri: true },
    { angle: 90, dome: 0.3 }, { angle: 90, dome: 0.3, tri: true }, { angle: 150 },
  ]) {
    const name = JSON.stringify(c);
    const res = run(c);
    assert.ok(res.counts.every((k) => k === 2), name + ': closed and manifold');
    assert.ok(res.flat, name + ': no warped faces');
    const ends = res.tops.map(res.onRim).sort((a, b) => a - b);
    assert.ok(ends[0] < 1e-6 && ends[1] < 1e-6, name + ': bevel corners stay on the border edges');
    assert.ok(res.tops.every((p) => p.y <= res.corner.y + 1e-6), name + ': nothing is raised above the corner');
    // The amount is the width taken from each face, as in other modeling
    // programs.
    assert.ok(Math.abs(res.bottomSetback - 0.3) < 1e-3, name + ': bevel width matches the amount');
  }
  console.log('Single-edge bevel cuts into the corner without raising the faces around it.');
} finally {
  await server.close();
}
