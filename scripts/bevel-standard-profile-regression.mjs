// A smooth single-edge bevel matches the standard bevel of other modeling
// programs: the entered amount is the width taken from each face, and the
// round profile is the quarter ellipse inside the corner's parallelogram.
// Reference points below were produced by Blender 5.0 (bmesh.ops.bevel,
// offset type Offset, profile 0.5) on the same bent bar.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent',
});
const BLENDER = {
  155: [[-0.537, 0.3931], [-0.404, 0.4166], [-0.2508, 0.433], [-0.085, 0.4413], [0.085, 0.4413], [0.2508, 0.433], [0.404, 0.4166], [0.537, 0.3931]],
  90: [[-0.2121, 0.495], [-0.1362, 0.5501], [-0.0469, 0.5791], [0.0469, 0.5791], [0.1362, 0.5501], [0.2121, 0.495]],
};
const SETTINGS = { 155: [0.55, 7], 90: [0.3, 5] };
try {
  globalThis.window = { self: {}, top: {} };
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { bevelEdge } = await server.ssrLoadModule('/src/lib/meshTools.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
  for (const angle of [155, 90]) {
    const [amount, segments] = SETTINGS[angle];
    const h = (angle / 2) * Math.PI / 180;
    const dirA = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)), dirB = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    const up = new THREE.Vector3(0, 1, 0);
    const sideA = new THREE.Vector3().crossVectors(up, dirA).normalize(), sideB = new THREE.Vector3().crossVectors(dirB, up).normalize();
    const m = new EditableMesh('bar');
    let id = 930000;
    const add = (p) => { const v = { id: id++, x: p.x, y: p.y, z: p.z }; m.vertices.push(v); return v.id; };
    const ring = (c, side, k) => [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, y]) => add(c.clone().addScaledVector(side, sx * 0.5 * k).addScaledVector(up, y)));
    const ra = ring(dirA.clone().multiplyScalar(4), sideA, 1);
    const rm = ring(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 1 / Math.sin(h));
    const rb = ring(dirB.clone().multiplyScalar(4), sideB, 1);
    for (const [r1, r2] of [[ra, rm], [rm, rb]]) for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.faces.push([r1[k], r1[k2], r2[k2], r2[k]]); }
    m.faces.push([ra[0], ra[3], ra[2], ra[1]], [rb[0], rb[1], rb[2], rb[3]]);
    m.invalidateCache();
    const index = m.getEdges().findIndex((e) => edgeKey(e.v1, e.v2) === edgeKey(rm[1], rm[2]));
    const sm = { selection: { meshId: m.id, type: 'edge', indices: [index] }, meshes: [m], getMesh: () => m,
      setSelection(sel) { this.selection = sel; }, clearSelection() {}, rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    bevelEdge(sm, { radius: amount, segments, smooth: true, sweep: false, skipUndo: true });
    const ours = m.vertices.filter((v) => Math.abs(v.y) < 1e-9 && v.z > 0.2).map((v) => [v.x, v.z]).sort((a, b) => a[0] - b[0]);
    const ref = BLENDER[angle];
    assert.equal(ours.length, ref.length, `${angle}°: same number of bevel points`);
    ours.forEach((p, i) => assert.ok(Math.hypot(p[0] - ref[i][0], p[1] - ref[i][1]) < 2e-4, `${angle}°: point ${i} matches the standard bevel`));
  }
  console.log('Single-edge bevel matches the standard bevel profile.');
} finally {
  await server.close();
}
