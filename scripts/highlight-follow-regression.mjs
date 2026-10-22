// Regression: object highlight follows high-poly mesh transforms without
// reallocating wireframe geometry, and startup camera matches reference cube.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false, root: process.cwd(),
  resolve: { alias: { '@': process.cwd() + '/src' } },
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, entries: [] },
  appType: 'custom', logLevel: 'silent',
});
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
try {
  globalThis.window = { self: {}, top: {} };
  const scheduled = new Map();
  let seq = 0;
  globalThis.requestAnimationFrame = callback => {
    const id = ++seq;
    scheduled.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => scheduled.delete(id);

  const { SceneManager } = await server.ssrLoadModule('/src/lib/SceneManager.js');
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { syncObjectHighlightTransforms } = await server.ssrLoadModule('/src/lib/highlightFollow.js');

  const geometry = new THREE.CylinderGeometry(1, 1, 3, 48, 170);
  const mesh = EditableMesh.fromGeometry(geometry, 'heavy selected object');
  geometry.dispose();
  assert.ok(mesh.getTriangleCount() > 16000 && mesh.getTriangleCount() < 17000);

  const threeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const highlightGroup = new THREE.Group();
  let highlightBuilds = 0, edgesBuilt = 0, hudUpdates = 0, centerLookups = 0;
  const toEdges = mesh.toEdgesGeometry.bind(mesh);
  mesh.toEdgesGeometry = () => { edgesBuilt++; return toEdges(); };
  const manager = {
    renderer: { getSize: v => v.set(720, 1465) },
    meshes: [mesh],
    threeObjects: new Map([[mesh.id, { mesh: threeMesh, wireframe: { visible: true } }]]),
    highlightGroup, selection: { meshId: mesh.id, type: 'object', indices: [] },
    selectedMeshIds: [mesh.id], selectionMode: 'object',
    cb: { onSelectionChange() {} },
    _liveEdit: true, wireframesHidden: false,
    getMesh(id) { return this.meshes.find(m => m.id === id); },
    getWorldMatrix(m) { return new THREE.Matrix4().compose(m.position,
      new THREE.Quaternion().setFromEuler(m.rotation), m.scale); },
    getSelectionCenter() { centerLookups++; return mesh.position.clone(); },
    isGroupMode() { return this.selectedMeshIds.length > 1; },
    snapCorrection() { return new THREE.Vector3(); },
    updateHud() { hudUpdates++; },
    updateHighlights() {
      highlightBuilds++;
      SceneManager.prototype.updateHighlights.call(this);
    },
    updateObjectTransform(id) { SceneManager.prototype.updateObjectTransform.call(this, id); },
    refreshInteractionFeedback() { SceneManager.prototype.refreshInteractionFeedback.call(this); },
    translateSelection(delta) { SceneManager.prototype.translateSelection.call(this, delta); },
    translateGroup(delta) { SceneManager.prototype.translateGroup.call(this, delta); },
    scaleSelection(factor) { SceneManager.prototype.scaleSelection.call(this, factor); },
    applyScaleSnap() {},
  };

  manager.updateHighlights();
  assert.equal(highlightBuilds, 1);
  assert.equal(edgesBuilt, 1);
  const highlight = highlightGroup.children[0];
  const edgeGeometry = highlight.geometry;
  assert.equal(highlight.userData.axisFollowMeshId, mesh.id);

  for (let i = 0; i < 40; i++) {
    manager.translateSelection(new THREE.Vector3(.1, -.03, .02));
    assert.ok(highlight.position.distanceTo(threeMesh.position) < 1e-10,
      'Highlight should match the object DURING the input event, not the following frame');
  }
  assert.equal(centerLookups, 0, 'Unsnapped object movement must not scan every heavy-mesh vertex');
  assert.equal(highlightBuilds, 1, 'Dragging cannot rebuild heavy highlight geometry');
  assert.equal(edgesBuilt, 1, 'Dragging cannot regenerate thousands of edge segments');
  assert.equal(highlight.geometry, edgeGeometry, 'The identical GPU edge buffer should be reused');
  assert.equal(scheduled.size, 1, 'HUD feedback should be coalesced to a single frame');

  manager.scaleSelection(1.3);
  assert.equal(highlight.geometry, edgeGeometry);
  assert.ok(highlight.scale.distanceTo(threeMesh.scale) < 1e-10);
  mesh.rotation.set(.2, .4, .1);
  manager.updateObjectTransform(mesh.id);
  assert.ok(highlight.quaternion.angleTo(threeMesh.quaternion) < 1e-7);
  assert.equal(highlightBuilds, 1);

  // The 20k-triangle optimization may hide geometry wires, but not a stable
  // object-selection outline whose transform is cheap to follow.
  const bigGeometry = new THREE.CylinderGeometry(1, 1, 3, 64, 176);
  const big = EditableMesh.fromGeometry(bigGeometry, '20k triangle object');
  bigGeometry.dispose();
  assert.ok(big.getTriangleCount() > 20000);
  const oldMesh = manager.meshes[0], oldSelection = manager.selection;
  manager.meshes[0] = big;
  manager.selection = { meshId: big.id, type: 'object', indices: [] };
  manager.threeObjects.set(big.id, { mesh: new THREE.Mesh(new THREE.BoxGeometry()), wireframe: { visible: true } });
  manager._heavyEdit = false;
  manager.beginHeavyEdit = () => SceneManager.prototype.beginHeavyEdit.call(manager, big.id);
  const themeModule = await server.ssrLoadModule('/src/lib/theme.js');
  const oldSetting = themeModule.theme.hideDetailWhileEditing;
  // Test the high-poly path only if user preference enables it.
  if (oldSetting) {
    manager.beginHeavyEdit();
    assert.equal(manager.highlightGroup.visible, true,
      'Object outlines should remain visible during heavy transforms');
  }
  manager._heavyEdit = false;
  manager.meshes[0] = oldMesh;
  manager.selection = oldSelection;

  // Multi-object selection must also follow the source THREE.Mesh transforms
  // instead of reconstructing every selected object's lines on each move.
  const second = EditableMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1));
  const secondObject = new THREE.Mesh(new THREE.BoxGeometry());
  manager.meshes.push(second);
  manager.threeObjects.set(second.id, { mesh: secondObject, wireframe: { visible: true } });
  manager.selectedMeshIds = [mesh.id, second.id];
  manager.updateHighlights();
  const groupHighlights = [...manager.highlightGroup.children];
  assert.equal(groupHighlights.length, 2);
  const groupGeometry = groupHighlights.map(h => h.geometry);
  manager.getGroupCenter = () => mesh.position.clone().add(second.position).multiplyScalar(.5);
  for (let i = 0; i < 15; i++) manager.translateGroup(new THREE.Vector3(.1, 0, .15));
  groupHighlights.forEach((hl, i) => {
    const source = manager.threeObjects.get(hl.userData.axisFollowMeshId).mesh;
    assert.ok(hl.position.distanceTo(source.position) < 1e-10);
    assert.equal(hl.geometry, groupGeometry[i]);
  });

  // Edge/vertex overlays must be made before the WebGL render pass, not in an
  // RAF callback whose ordering competes with the animation loop.
  manager.selectedMeshIds = [mesh.id];
  manager.selection = { meshId: mesh.id, type: 'edge', indices: [0] };
  manager._interactionHighlightsDirty = false;
  manager.refreshInteractionFeedback();
  assert.equal(manager._interactionHighlightsDirty, true);
  const sceneCode = await readFile('src/lib/SceneManager.js', 'utf8');
  const animateBody = sceneCode.slice(sceneCode.indexOf('  animate() {'),
    sceneCode.indexOf('  // Returns true when rendering must be skipped'));
  assert.ok(animateBody.indexOf('if (this._interactionHighlightsDirty') <
    animateBody.indexOf('this.renderer.render('));
  assert.ok(animateBody.indexOf('syncObjectHighlightTransforms(this)') <
    animateBody.indexOf('this.renderer.render('));

  // 1-unit cube and screen dimensions approximating user's screenshot:
  // cube projected about 200 px across and 200 px high, at ~22° elevation.
  assert.match(sceneCode, /setCameraOrbit\(11\.5, Math\.PI \/ 4, THREE\.MathUtils\.degToRad\(22\)\)/);
  const eyeRadius = 11.5, theta = Math.PI / 4, phi = THREE.MathUtils.degToRad(22);
  const camera = new THREE.PerspectiveCamera(50, 720 / 1465, .1, 1000);
  camera.position.set(eyeRadius * Math.cos(phi) * Math.sin(theta),
    eyeRadius * Math.sin(phi), eyeRadius * Math.cos(phi) * Math.cos(theta));
  camera.up.set(-Math.sin(phi) * Math.sin(theta), Math.cos(phi),
    -Math.sin(phi) * Math.cos(theta));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const corners = [];
  for (const x of [-.5, .5]) for (const y of [0, 1]) for (const z of [-.5, .5]) {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    corners.push({ x: (projected.x + 1) * 360, y: (1 - projected.y) * 1465 / 2 });
  }
  const cubeWidth = Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x));
  const cubeHeight = Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y));
  assert.ok(cubeWidth > 190 && cubeWidth < 210, 'Default cube is too close/far versus screenshot');
  assert.ok(cubeHeight > 190 && cubeHeight < 210, 'Default cube elevation differs from screenshot');

  syncObjectHighlightTransforms(manager);
  assert.ok(hudUpdates >= 1);
  console.log('PASS: high-poly object and group highlight transforms reuse GPU geometry, subobject refresh precedes render, reference default camera matches screenshot');
} finally {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  await server.close();
}
