import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Orientation reset lines an object's own axes up with the world axes without
// moving it, so a single-axis scale afterwards follows the world axis; undoing
// the reset brings the old axes back while keeping edits made in between.
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent' });
try {
  globalThis.window = { self: {}, top: {} };
  const THREE = await server.ssrLoadModule('three');
  const { applySceneOrientation } = await server.ssrLoadModule('/src/lib/sceneOrientation.js');
  const { createPrimitive } = await server.ssrLoadModule('/src/lib/primitives.js');
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');

  class Fixture {
    constructor(meshes) { this.meshes = meshes; this.selection = { meshId: null, type: 'object', indices: [] }; this.selectedMeshIds = []; this.undos = 0; }
    getMesh(id) { return this.meshes.find((m) => m.id === id) || null; }
    isGroupMode() { return this.selectedMeshIds.length > 1; }
    pushUndo() { this.undos++; }
    rebuildThreeMesh() {}
    updateHighlights() {}
    updateStats() {}
    updateHud() {}
  }
  applySceneOrientation(Fixture);

  const world = (mesh) => {
    const matrix = new THREE.Matrix4().compose(mesh.position, new THREE.Quaternion().setFromEuler(mesh.rotation), mesh.scale);
    return mesh.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(matrix));
  };
  const same = (a, b) => a.every((p, i) => p.distanceTo(b[i]) < 1e-9);
  const extent = (points, axis) => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));

  const cube = createPrimitive('cube');
  cube.position.set(2, 0.5, -1);
  cube.rotation.set(0, Math.PI / 4, 0);
  cube.scale.set(1, 1.5, 1);
  const sm = new Fixture([cube]);

  // Nothing selected: nothing to reset.
  assert.equal(sm.resetOrientation(), false);

  sm.selection = { meshId: cube.id, type: 'object', indices: [] };
  const before = world(cube);
  assert.equal(sm.resetOrientation(), true);
  assert.ok(Math.abs(cube.rotation.x) + Math.abs(cube.rotation.y) + Math.abs(cube.rotation.z) < 1e-12, 'axes line up with the world');
  assert.ok(same(world(cube), before), 'the object does not move');
  assert.equal(cube.scale.y, 1.5, 'its own scale is kept');
  assert.equal(sm.undos, 1);
  assert.equal(cube.orientationResets.length, 1);
  console.log('PASS: reset lines the axes up with the world without moving the object');

  // A cube turned 45° then stretched along X becomes a long diamond.
  cube.scale.x = 3;
  const stretched = world(cube);
  const diag = Math.SQRT2;
  assert.ok(Math.abs(extent(stretched, 'x') - diag * 3) < 1e-9 && Math.abs(extent(stretched, 'z') - diag) < 1e-9, 'scaling follows the world X axis');
  console.log('PASS: after a reset a single-axis scale follows the world axis');

  // A second tap on an object that is already lined up changes nothing.
  assert.equal(sm.resetOrientation(), true);
  assert.equal(cube.orientationResets.length, 1, 'an earlier reset is not overwritten');

  // Edit a vertex, then undo the reset: the old axes come back, the edit stays.
  cube.vertices[0].x += 0.25;
  const edited = world(cube);
  assert.equal(sm.undoOrientationReset(), true);
  assert.ok(Math.abs(cube.rotation.y - Math.PI / 4) < 1e-9 && Math.abs(cube.rotation.x) < 1e-9 && Math.abs(cube.rotation.z) < 1e-9, 'the old axes come back');
  assert.ok(same(world(cube), edited), 'nothing moves and the edit is kept');
  assert.equal(cube.orientationResets.length, 0);
  assert.equal(sm.canUndoOrientationReset(), false);
  console.log('PASS: undoing a reset brings the old axes back and keeps the edits');

  // Several selected objects reset together, and saves keep what to undo.
  const a = createPrimitive('cube'), b = createPrimitive('cylinder', 12);
  a.rotation.set(0.3, 0.2, 0.1); b.rotation.set(-0.5, 0, 0.7);
  const group = new Fixture([a, b]);
  group.selectedMeshIds = [a.id, b.id];
  group.selection = { meshId: a.id, type: 'object', indices: [] };
  const wa = world(a), wb = world(b);
  group.resetOrientation();
  assert.ok(same(world(a), wa) && same(world(b), wb));
  assert.ok(a.primitiveType === null && b.primitiveType === null, 'a rebuilt primitive cannot undo the reset');
  const saved = EditableMesh.deserialize(a.serialize());
  assert.deepEqual(saved.orientationResets, a.orientationResets);
  assert.deepEqual(a.clone().orientationResets, a.orientationResets);
  const kept = group.captureOrientation([a, b]);
  group.undoOrientationReset();
  assert.ok(same(world(a), wa) && same(world(b), wb));
  group.restoreOrientation(kept);
  assert.ok(Math.abs(a.rotation.x) < 1e-12 && same(world(a), wa) && a.orientationResets.length === 1, 'Cancel puts the reset back');
  console.log('PASS: groups reset together; saves, copies and Cancel keep the reset');
} finally { await server.close(); }
