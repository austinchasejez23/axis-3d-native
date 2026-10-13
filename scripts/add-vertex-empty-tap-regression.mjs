import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';

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
  const { applySceneAddVertex } = await server.ssrLoadModule('/src/lib/sceneAddVertex.js');

  class FakeSceneManager {
    constructor() {
      this.mesh = EditableMesh.fromGeometry(new THREE.BoxGeometry(2, 2, 2), 'empty-tap-test');
      this.cb = { onAddVertexChange: (v) => this.events.push(v) };
      this.events = [];
      this.undo = [];
      this.tapTarget = 'edge';
    }
    captureSnapshot() { return { mesh: this.mesh.clone() }; }
    restoreSnapshot(snapshot) { this.mesh = snapshot.mesh.clone(); }
    screenToNDC() { return { x: 0, y: 0 }; }
    findClosestEdge() { return this.tapTarget === 'edge' ? { meshId: this.mesh.id, index: 0 } : null; }
    raycastMeshes() { return this.tapTarget === 'face' ? [{ object: {} }] : []; }
    getMesh(id) { return id === this.mesh.id ? this.mesh : null; }
    edgeParamAtScreen() { return 0.3; }
    rebuildThreeMesh() {}
    setSelection() {}
    pushUndoSnapshot(s) { this.undo.push(s); }
  }

  applySceneAddVertex(FakeSceneManager);

  const m = new FakeSceneManager();
  const originalVertices = m.mesh.vertices.length;
  const originalFaces = JSON.stringify(m.mesh.faces);
  m.enterAddVertexMode();
  m.setAddVertexCenterSnap(true);
  assert.equal(m.handleAddVertexTap(50, 50), true);
  assert.equal(m.handleAddVertexTap(60, 60), true);
  assert.equal(m.mesh.vertices.length, originalVertices + 2, 'Two pending vertices required before rollback');
  assert.equal(m.addVertexMode.vertexIds.length, 2);

  m.tapTarget = 'face';
  assert.equal(m.handleAddVertexTap(70, 70), false, 'Tap on face away from an edge should be ignored');
  assert.equal(m.addVertexMode.vertexIds.length, 2, 'Face tap must not exit the tool');

  m.tapTarget = 'empty';
  assert.equal(m.handleAddVertexTap(70, 70), true, 'Empty tap should be handled as Cancel');
  assert.equal(m.addVertexMode, null, 'Entire tool should exit after blank tap');
  assert.equal(m.events.at(-1), null, 'Panel should close after blank tap');
  assert.equal(m.mesh.vertices.length, originalVertices, 'Every unconfirmed vertex must be discarded');
  assert.equal(JSON.stringify(m.mesh.faces), originalFaces, 'Mesh faces must be restored fully');
  assert.equal(m.undo.length, 0, 'Blank tap must never commit to undo history');

  m.tapTarget = 'edge';
  m.enterAddVertexMode();
  assert.equal(m.handleAddVertexTap(80, 80), true);
  assert.equal(m.confirmAddVertex(), true, 'Checkmark must apply');
  assert.equal(m.mesh.vertices.length, originalVertices + 1, 'Checkmark must preserve added vertex');
  assert.equal(m.undo.length, 1, 'Checkmark must push undo history');

  const touch = fs.readFileSync('src/lib/sceneGestures.js','utf8');
  const mouse = fs.readFileSync('src/lib/sceneMouse.js','utf8');
  assert.match(touch, /if \(this\.gesture === 'add_vertex_pending'\) \{\s+if \(!this\.movedSignificantly\) this\.handleAddVertexTap/);
  assert.match(mouse, /if \(m\.mode === 'add_vertex'\) \{\s+if \(!m\.moved\) this\.handleAddVertexTap/);

  const counter = fs.readFileSync('src/components/modeler/TriangleCounter.jsx','utf8');
  const bar = fs.readFileSync('src/components/modeler/BottomToolbar.jsx','utf8');
  const top = fs.readFileSync('src/components/modeler/TopBar.jsx','utf8');
  assert.match(counter, /left-\[6px\] w-16.*justify-center/, 'Counter must center with 64px Menu button');
  assert.match(bar, /left-0 right-0.*safe-bottom pt-1/, 'Bottom bar should retain full viewport width');
  assert.match(bar, /rgba\(9,13,22,0\.26\)/, 'Bottom toolbar should have faint transparent background');
  assert.match(top, /One subtle backdrop for all five right-side controls/, '5-button common backdrop missing');
  assert.match(top, /pointer-events-none absolute -top-1 -bottom-1/, 'Backdrop must not intercept touches');

  console.log('PASS: empty canvas exits Add Vertex and rolls back all unconfirmed vertices; face taps keep tool open; checkmark commits; both gesture paths use cancel-on-empty; HUD backgrounds and alignment');
} finally {
  await server.close();
}
