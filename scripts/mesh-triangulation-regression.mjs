import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Cases captured from the pre-migration Boolean-edge regression at
// z=0.5, y=-0.3. Several distinct, editable boundary vertices are collinear.
// They must not force zero-area triangles into the rendered geometry.
const polygons = [
  [
    [.6369357466697692, .810000002384186],
    [.4469357490539551, 1],
    [1, 1],
    [1, .44693574905395506],
    [.7679571739395983, .6789785751143569],
    [.7200000047683716, .4999999999999999],
  ],
  [
    [1, -1],
    [0, -1],
    [-1.3877787807814457e-17, -.09320508300715816],
    [.10000000000000009, -.12000000476837158],
    [.1273205155291739, -.1273205155291739],
    [.11577350613933626, -.11577350613933626],
    [.4100000023841857, -.03693574666976926],
    [.446935749053955, -1.3118846287074604e-17],
    [1, 0],
  ],
];
const polygonArea = p => Math.abs(p.reduce((sum, v, i) => {
  const n = p[(i + 1) % p.length];
  return sum + v[0] * n[1] - n[0] * v[1];
}, 0) / 2);

const server = await createServer({
  configFile: false, root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent',
});
try {
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  for (const [caseIndex, boundary] of polygons.entries()) {
    const mesh = new EditableMesh('collinear-boolean-boundary');
    mesh.vertices = boundary.map(([x, z], i) => ({ id: i + 1, x, y: 0.5, z }));
    mesh.faces = [mesh.vertices.map(v => v.id)];
    const triangles = mesh.getFaceTriangleIndices(0);
    assert.ok(triangles.length, 'triangulation must cover the face');
    const renderedArea = triangles.reduce((total, tri) => {
      const p = tri.map(i => boundary[i]);
      return total + Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1])
        - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])) / 2;
    }, 0);
    assert.ok(Math.abs(renderedArea - polygonArea(boundary)) < 1e-6,
      `case ${caseIndex}: render triangles must cover original polygon without overlap`);
    assert.equal(mesh.faces[0].length, boundary.length, 'editable border vertices must be preserved');
    // Every polygon border must remain a selectable wireframe edge.
    assert.equal(mesh.getEdges().length, boundary.length,
      `case ${caseIndex}: no unconnected border edges`);
    const geometry = mesh.toBufferGeometry();
    const position = geometry.getAttribute('position');
    assert.equal(position.count, triangles.length * 3, 'render attribute layout must match triangulation');
    for (let i = 0; i < position.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
      assert.ok(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() >= 1e-18,
        `case ${caseIndex}: zero-area render triangle ${i / 3}`);
    }
    geometry.dispose();
  }
  console.log('Boolean boundary triangulation preserves face area, edges and non-degenerate render geometry.');
} finally {
  await server.close();
}
