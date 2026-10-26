import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent' });
try {
  globalThis.window = { self: {}, top: {} };
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { SceneManager } = await server.ssrLoadModule('/src/lib/SceneManager.js');
  const { updateGeometryInPlace } = await server.ssrLoadModule('/src/lib/meshBufferUpdate.js');
  for (const method of ['rotateSelection', 'rotateSelectionAroundAxis']) for (const axis of ['x', 'y', 'z']) {
    const mesh = new EditableMesh('extruded round end');
    const sides = 14;
    for (const y of [-8, 8]) for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides;
      mesh.vertices.push({ id: mesh.vertices.length + 1, x: Math.cos(a), y, z: Math.sin(a) });
    }
    mesh.faces = [Array.from({ length: sides }, (_, i) => i + 1), Array.from({ length: sides }, (_, i) => 2 * sides - i)];
    for (let i = 0; i < sides; i++) { const a = i + 1, b = (i + 1) % sides + 1; mesh.faces.push([a, a + sides, b + sides, b]); }
    const topology = JSON.stringify(mesh.faces);
    const base = mesh.vertices.slice(0, sides).map(v => ({ ...v }));
    const manager = Object.create(SceneManager.prototype);
    Object.assign(manager, { selection: { meshId: mesh.id, type: 'face', indices: [1] }, rotatePivot: new THREE.Vector3(0, 8, 0), isGroupMode: () => false, getMesh: () => mesh, updateHighlights() {}, updateHud() {}, rebuildThreeMesh() {} });
    const expected = mesh.getTriangleCount();
    const initial = mesh.toBufferGeometry();
    for (let step = 0; step < 24; step++) {
      if (method === 'rotateSelection') manager[method](Math.PI / 24, axis);
      else manager[method](Math.PI / 24, new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0));
      assert.equal(mesh.getTriangleCount(), expected, `${method} ${axis} step ${step}: rotating the end must not remove wall triangles`);
      assert.equal(mesh.toBufferGeometry().getAttribute('position').count, expected * 3);
      assert.equal(JSON.stringify(mesh.faces), topology, 'rotation must preserve editable topology');
      assert.deepEqual(mesh.vertices.slice(0, sides), base, 'opposite end must stay fixed');
    }
    assert.equal(updateGeometryInPlace(mesh, initial), false, 'preserved folded faces must use per-triangle normals from the full builder');
    const copy = EditableMesh.deserialize(mesh.serialize());
    assert.equal(copy.getTriangleCount(), expected, 'saving and reopening must retain the complete surface');
  }
  console.log('PASS: both rotation paths, all axes, 24 steps each, complete walls, fixed opposite end, unchanged topology and save/reopen.');
} finally { await server.close(); }