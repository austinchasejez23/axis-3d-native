import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

// Deleting a vertex never removes other geometry: a face corner (merging point)
// is refused and nothing changes; a point on a straight edge is taken out of
// the faces around it, which all stay.
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { deleteVerticesKeepingGeometry } = await server.ssrLoadModule('/src/lib/dissolveTools.js');

  const plane = (vertices, faces) => {
    const mesh = new EditableMesh('plane');
    mesh.vertices = vertices.map(([x, y, z], id) => ({ id, x, y, z }));
    mesh.faces = faces.map((f) => [...f]);
    mesh.invalidateCache();
    return mesh;
  };
  const shape = (mesh) => JSON.stringify({ v: mesh.vertices.map((v) => v.id), f: mesh.faces });

  // Cube corners are face corners: refused, cube untouched.
  const cube = EditableMesh.fromGeometry(new THREE.BoxGeometry(2, 2, 2), 'cube');
  const before = shape(cube);
  assert.equal(deleteVerticesKeepingGeometry(cube, [cube.vertices[0].id]), false);
  assert.equal(shape(cube), before, 'A refused delete changes nothing');

  // Quad with a point in the middle of its bottom edge.
  const quad = plane([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [1, 0, 0]], [[0, 4, 1, 2, 3]]);
  assert.equal(deleteVerticesKeepingGeometry(quad, [0]), false, 'A face corner is refused');
  assert.equal(quad.faces.length, 1);
  assert.equal(deleteVerticesKeepingGeometry(quad, [4]), true, 'A point on a straight edge is deleted');
  assert.equal(quad.faces.length, 1, 'The face stays');
  assert.deepEqual([...quad.faces[0]].sort(), [0, 1, 2, 3]);
  assert.ok(!quad.getVertex(4));

  // Two quads sharing an edge, with a point in the middle of that edge.
  const pair = plane(
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], [0, 1, 0], [1, 0.5, 0]],
    [[0, 1, 6, 4, 5], [1, 2, 3, 4, 6]],
  );
  assert.equal(deleteVerticesKeepingGeometry(pair, [1]), false, 'Where faces meet is refused');
  assert.equal(deleteVerticesKeepingGeometry(pair, [6, 1]), false, 'One refused vertex refuses the whole delete');
  assert.ok(pair.getVertex(6), 'Nothing is deleted when any vertex is refused');
  assert.equal(deleteVerticesKeepingGeometry(pair, [6]), true);
  assert.equal(pair.faces.length, 2, 'Both faces stay');
  assert.ok(pair.faces.every((f) => f.length === 4 && !f.includes(6)));

  console.log('PASS: vertex delete refuses face corners and only removes points on straight edges');
} finally {
  await server.close();
}
