import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
  appType: 'custom',
  logLevel: 'silent',
});

const close = (a, b, label) => {
  assert.ok(a.distanceTo(b) < 0.00001,
    `${label}: expected ${b.toArray()} but got ${a.toArray()}`);
};

try {
  const { EditableMesh } = await vite.ssrLoadModule('/src/lib/EditableMesh.js');
  const { applySceneRadialArray } = await vite.ssrLoadModule('/src/lib/sceneRadialArray.js');

  class TestManager {
    constructor(origin) {
      const mesh = EditableMesh.fromGeometry(new THREE.BoxGeometry(2, 2, 2), 'source');
      mesh.position.copy(origin);
      mesh.rotation.set(0.1, 0.3, 0);
      this.meshes = [mesh];
      this.selection = { meshId: mesh.id, type: 'object', indices: [] };
      this.selectedMeshIds = [mesh.id];
      this.selectionMode = 'object';
      this.undoStack = [];
      this.maxUndo = 20;
      this.highlights = 0;
      this.stats = 0;
      this.huds = 0;
    }
    getMesh(id) { return this.meshes.find(m => m.id === id); }
    isGroupMode() { return this.selectionMode === 'object' && this.selectedMeshIds.length > 1; }
    getGroupCenter() {
      const center = new THREE.Vector3();
      for (const id of this.selectedMeshIds) center.add(this.getMesh(id).position);
      return center.divideScalar(this.selectedMeshIds.length);
    }
    buildThreeMesh() {}
    rebuildThreeMesh() {}
    updateObjectTransform() {}
    updateHighlights() { this.highlights++; }
    updateStats() { this.stats++; }
    updateHud() { this.huds++; }
    removeMesh(id) {
      this.meshes = this.meshes.filter(m => m.id !== id);
      this.selectedMeshIds = this.selectedMeshIds.filter(mid => mid !== id);
    }
    captureSnapshot() {
      return {
        meshes: this.meshes.map(m => m.clone()),
        selection: { ...this.selection, indices: [...this.selection.indices] },
        selectedMeshIds: [...this.selectedMeshIds],
        selectionMode: this.selectionMode,
      };
    }
    restoreSnapshot(snapshot) {
      this.meshes = snapshot.meshes.map(m => m.clone());
      this.selection = { ...snapshot.selection, indices: [...snapshot.selection.indices] };
      this.selectedMeshIds = [...snapshot.selectedMeshIds];
      this.updateHighlights();
      this.updateStats();
      this.updateHud();
    }
    pushUndo() { this.undoStack.push(this.captureSnapshot()); }
    pushUndoSnapshot(snapshot) { this.undoStack.push(snapshot); }
    translateGroup(delta) {
      for(const id of this.selectedMeshIds) this.getMesh(id).position.add(delta);
    }
    scaleGroup(f) {
      const center = this.getGroupCenter();
      for(const id of this.selectedMeshIds) {
        const mesh = this.getMesh(id);
        mesh.position.sub(center).multiplyScalar(f).add(center);
        mesh.scale.multiplyScalar(f);
      }
    }
    scaleGroupAxis(axis, f) {
      const center = this.getGroupCenter();
      for(const id of this.selectedMeshIds) {
        const mesh = this.getMesh(id);
        mesh.position[axis] = center[axis] + (mesh.position[axis] - center[axis]) * f;
        mesh.scale[axis] *= f;
      }
    }
    scaleSelectionAxis(axis, f) { this.getMesh(this.selection.meshId).scale[axis] *= f; }
    rotateGroupAroundAxis(a, axis) {
      const center = this.getGroupCenter();
      const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), a);
      for (const id of this.selectedMeshIds) {
        const mesh = this.getMesh(id);
        mesh.position.sub(center).applyQuaternion(q).add(center);
        mesh.rotation.setFromQuaternion(new THREE.Quaternion().setFromEuler(mesh.rotation).premultiply(q));
      }
    }
  }

  applySceneRadialArray(TestManager);
  const m = new TestManager(new THREE.Vector3(5.25, 3, -2.5));
  const source = m.meshes[0];
  const startingPosition = source.position.clone();
  const startingRotation = source.rotation.clone();
  const originalVertices = source.vertices.map(v => ({ ...v }));
  const initialCount = m.meshes.length;

  assert.ok(m.beginRadialArray({ count: 12, axis: 'y', follow: true, radius: 6 }));
  assert.equal(m.meshes.length, 12);
  assert.equal(m.selectedMeshIds.length, 12);
  assert.equal(m.isGroupMode(), true);
  close(source.position, startingPosition, 'Source position must never jump when array opens');
  const pivot = startingPosition.clone().add(new THREE.Vector3(-6, 0, 0));
  for (const mesh of m.meshes) {
    assert.ok(Math.abs(mesh.position.distanceTo(pivot) - 6) < 0.00001,
      'All copies orbit around source-relative pivot');
  }
  assert.ok(m.meshes.some(mesh => mesh !== source && !mesh.position.equals(source.position)),
    'Array should contain non-overlapping copies');

  assert.ok(m.updateRadialArray({ count: 8, axis: 'y', follow: true, radius: 4 }));
  assert.equal(m.meshes.length, 8);
  close(source.position, startingPosition, 'Count/radius editing cannot move source');
  assert.equal(m.selectedMeshIds.length, 8);
  assert.equal(m.isGroupMode(), true);

  const sourceBeforeTranslation = source.position.clone();
  const delta = new THREE.Vector3(2, -1.25, 4);
  m.translateGroup(delta);
  close(source.position, sourceBeforeTranslation.clone().add(delta), 'Group move should move source');
  const movedSource = source.position.clone();
  m.updateRadialArray({ count: 7, axis: 'y', follow: true, radius: 4 });
  assert.equal(m.meshes.length, 7);
  close(source.position, movedSource, 'Group translation should survive count edit');

  const centerBeforeScaling = m.getGroupCenter().clone();
  const expectedScaledSource = centerBeforeScaling.clone()
    .add(source.position.clone().sub(centerBeforeScaling).multiplyScalar(1.5));
  m.pushUndo(); // Preview gestures must not push an undo snapshot.
  assert.equal(m.undoStack.length, 0);
  m.scaleGroup(1.5);
  close(source.position, expectedScaledSource, 'Preview should scale as group');
  const scaledSource = source.position.clone();
  const scaledCopy = m.getMesh(m.selectedMeshIds[1]).position.clone();
  const beforeScale = source.scale.clone();
  assert.ok(beforeScale.x > 1.4);
  m.updateRadialArray({ count: 7, axis: 'y', follow: true, radius: 4 });
  close(source.position, scaledSource, 'Group scaling should survive preview regeneration');
  close(m.getMesh(m.selectedMeshIds[1]).position, scaledCopy,
    'Preview copy spacing should retain group scaling');
  close(source.scale, beforeScale, 'Source object scale must persist');

  const axisCenter = m.getGroupCenter().clone();
  const copyBeforeAxis = m.getMesh(m.selectedMeshIds[1]).position.clone();
  const sourceBeforeAxis = source.position.clone();
  m.scaleSelectionAxis('x', 1.2);
  const copyAfterAxis = m.getMesh(m.selectedMeshIds[1]).position.clone();
  assert.ok(Math.abs(copyAfterAxis.x - (axisCenter.x + (copyBeforeAxis.x - axisCenter.x) * 1.2)) < 0.00001,
    'Axis scale should affect the position of every preview copy');
  assert.ok(Math.abs(source.position.x - (axisCenter.x + (sourceBeforeAxis.x - axisCenter.x) * 1.2)) < 0.00001,
    'Axis scale should affect source position around the group center');
  const worldGeometry = mesh => mesh.vertices.map(v => new THREE.Vector3(v.x, v.y, v.z)
    .applyMatrix4(new THREE.Matrix4().compose(mesh.position, new THREE.Quaternion().setFromEuler(mesh.rotation), mesh.scale)));
  const worldBefore = worldGeometry(source);
  const firstCopyBefore = worldGeometry(m.getMesh(m.selectedMeshIds[1]));
  m.updateRadialArray({ count: 7, axis: 'y', follow: true, radius: 4 });
  const worldAfter = worldGeometry(source);
  const firstCopyAfter = worldGeometry(m.getMesh(m.selectedMeshIds[1]));
  worldAfter.forEach((v, i) => close(v, worldBefore[i], 'World-space axis scaling must survive count changes'));
  firstCopyAfter.forEach((v, i) => close(v, firstCopyBefore[i], 'Rotated preview copy must preserve its scaled world-space geometry'));
  m.updateRadialArray({ count: 9, axis: 'y', follow: true, radius: 4 });
  worldGeometry(source).forEach((v, i) => close(v, worldBefore[i], 'Source should remain transformed when Count changes'));
  assert.equal(m.selectedMeshIds.length, 9);

  assert.equal(m.cancelRadialArray(), true);
  assert.equal(m._radialArray, null);
  assert.equal(m.meshes.length, initialCount);
  close(m.meshes[0].position, startingPosition, 'Cancel must restore exact source position');
  assert.ok(m.meshes[0].rotation.equals(startingRotation), 'Cancel must restore rotation');
  assert.deepEqual(m.meshes[0].vertices, originalVertices, 'Cancel must restore geometry');
  assert.equal(m.undoStack.length, 0, 'Cancel must not create undo history');
  assert.equal(m.selectedMeshIds.length, 1);

  assert.ok(m.beginRadialArray({ count: 5, axis: 'z', follow: false, radius: 2 }));
  assert.equal(m.meshes.length, 5);
  close(m.meshes[0].position, startingPosition, 'Axis switch cannot move source');
  for (const clone of m.meshes.slice(1)) {
    assert.ok(clone.rotation.equals(startingRotation), 'Without Follow, all rotations match source');
  }
  const committed = m.meshes.map(mesh => mesh.position.clone());
  assert.equal(m.commitRadialArray(), true);
  assert.equal(m._radialArray, null);
  assert.equal(m.meshes.length, 5);
  assert.equal(m.selectedMeshIds.length, 5);
  assert.equal(m.undoStack.length, 1, 'Apply must create one undo step');
  committed.forEach((pos, i) => close(m.meshes[i].position, pos, 'Apply should preserve preview positions'));

  const buttons = fs.readFileSync('src/components/modeler/GridToolButton.jsx', 'utf8');
  const backdrop = fs.readFileSync('src/components/modeler/GlassToolRow.jsx', 'utf8');
  const modeGrid = fs.readFileSync('src/components/modeler/ModeToolGrid.jsx', 'utf8');
  const generalGrid = fs.readFileSync('src/components/modeler/GeneralToolGrid.jsx', 'utf8');
  assert.doesNotMatch(buttons, /background: 'rgba\(9,13,22,0\.26\)'/, 'Tool buttons must remain transparent');
  assert.match(backdrop, /background: 'rgba\(9,13,22,0\.26\)'/, 'Shared rows retain the translucent backdrop');
  assert.match(modeGrid, /arrange\.rows|const rows = arrange\.rows/);
  assert.match(generalGrid, /arrange\.rows\.map/);
  assert.match(modeGrid, /<GridToolButton/);
  assert.match(generalGrid, /<GridToolButton/);

  const touch = fs.readFileSync('src/lib/sceneGestures.js', 'utf8');
  const mouse = fs.readFileSync('src/lib/sceneMouse.js', 'utf8');
  assert.match(touch, /if \(this\._radialArray\) \{\s+clearTimeout\(this\.pressHoldTimer\)/);
  assert.match(mouse, /if \(!m\.moved && m\.button === 0 && this\._radialArray\)/);

  console.log('PASS: source-anchored radius, grouped highlights/selection, group move and scale, preserving edits while changing count, axis scale, cancel rollback, one-step apply, array tools and dynamic tool backgrounds');
} finally {
  await vite.close();
}
