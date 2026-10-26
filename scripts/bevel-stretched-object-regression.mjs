// An object resized with W / H / D (a per-axis scale) bevels exactly like the
// same shape built at that size: the bevel is measured on the object as it
// appears, not on its unstretched vertices.
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
  const { bevelEdge } = await server.ssrLoadModule('/src/lib/meshTools.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
  // A bar bent 155 degrees in plan, 1 x 1 in section.
  const build = (scale) => {
    const m = new EditableMesh('bar');
    let id = 920000;
    const h = (155 / 2) * Math.PI / 180;
    const dirA = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h)), dirB = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    const up = new THREE.Vector3(0, 1, 0);
    const sideA = new THREE.Vector3().crossVectors(up, dirA).normalize(), sideB = new THREE.Vector3().crossVectors(dirB, up).normalize();
    const add = (p) => { const v = { id: id++, x: p.x / scale.x, y: p.y / scale.y, z: p.z / scale.z }; m.vertices.push(v); return v.id; };
    const ring = (c, side, k) => [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([sx, y]) => add(c.clone().addScaledVector(side, sx * 0.5 * k).addScaledVector(up, y)));
    const ra = ring(dirA.clone().multiplyScalar(4), sideA, 1);
    const rm = ring(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 1 / Math.sin(h));
    const rb = ring(dirB.clone().multiplyScalar(4), sideB, 1);
    const quad = (a, b, c, d) => m.faces.push([a, b, c], [a, c, d]);
    for (const [r1, r2] of [[ra, rm], [rm, rb]]) for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(r1[k], r1[k2], r2[k2], r2[k]); }
    m.faces.push([ra[0], ra[3], ra[2]], [ra[0], ra[2], ra[1]], [rb[0], rb[1], rb[2]], [rb[0], rb[2], rb[3]]);
    m.scale.set(scale.x, scale.y, scale.z);
    m.invalidateCache();
    const index = m.getEdges().findIndex((e) => edgeKey(e.v1, e.v2) === edgeKey(rm[1], rm[2]));
    const sm = { selection: { meshId: m.id, type: 'edge', indices: [index] }, meshes: [m], getMesh: (mid) => (mid === m.id ? m : null),
      setSelection(sel) { this.selection = sel; }, clearSelection() { this.selection = { meshId: null, type: 'object', indices: [] }; },
      rebuildThreeMesh() {}, updateStats() {}, pushUndo() {} };
    bevelEdge(sm, { radius: 0.55, segments: 6, smooth: true, sweep: false, skipUndo: true });
    return m.vertices.map((v) => [v.x * scale.x, v.y * scale.y, v.z * scale.z].map((n) => n.toFixed(5)).join(',')).sort();
  };
  const plain = build({ x: 1, y: 1, z: 1 });
  const stretched = build({ x: 3, y: 1, z: 0.5 });
  assert.equal(stretched.length, plain.length, 'same vertex count');
  assert.deepEqual(stretched, plain, 'a stretched object bevels like the same shape built at that size');
  console.log('Stretched objects bevel the same as the shape they show.');
} finally {
  await server.close();
}
