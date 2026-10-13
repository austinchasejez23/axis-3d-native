import assert from 'node:assert/strict';
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
      this.mesh = EditableMesh.fromGeometry(new THREE.BoxGeometry(2, 2, 2), 'midpoint-test');
      this.history = [];
      this.updates = [];
      this.cb = { onAddVertexChange: (change) => this.updates.push(change) };
      this.currentSelection = null;
      this.edgeParamCalls = 0;
    }
    captureSnapshot() { return { mesh: this.mesh.clone() }; }
    restoreSnapshot(snapshot) { this.mesh = snapshot.mesh.clone(); }
    screenToNDC() { return { x: 0, y: 0 }; }
    findClosestEdge() { return { meshId: this.mesh.id, index: 0 }; }
    getMesh(id) { return id === this.mesh.id ? this.mesh : null; }
    edgeParamAtScreen() { this.edgeParamCalls++; return 0.18; }
    rebuildThreeMesh() {}
    setSelection(selection) { this.currentSelection = selection; }
    pushUndoSnapshot(snapshot) { this.history.push(snapshot); }
  }
  applySceneAddVertex(FakeSceneManager);

  const manager = new FakeSceneManager();
  const vertexCountBefore = manager.mesh.vertices.length;
  manager.enterAddVertexMode();
  assert.deepEqual(manager.updates.at(-1), { count: 0, snapCenter: false });

  manager.setAddVertexCenterSnap(true);
  assert.deepEqual(manager.updates.at(-1), { count: 0, snapCenter: true });
  let edge = manager.mesh.getEdges()[0];
  let a = manager.mesh.getVertex(edge.v1), b = manager.mesh.getVertex(edge.v2);
  const midpoint = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
  assert.equal(manager.addVertexAt(10, 10), true, 'midpoint insertion failed');
  let added = manager.mesh.getVertex(manager.addVertexMode.vertexIds.at(-1));
  assert.deepEqual([added.x, added.y, added.z], midpoint, 'Center mode did not create exact midpoint');
  assert.equal(manager.edgeParamCalls, 0, 'Center mode must ignore tap parameter');
  assert.deepEqual(manager.updates.at(-1), { count: 1, snapCenter: true });

  assert.equal(manager.deleteLastAddVertex(), true, 'Delete Last failed');
  assert.equal(manager.mesh.vertices.length, vertexCountBefore, 'Delete Last did not restore original mesh');
  assert.deepEqual(manager.updates.at(-1), { count: 0, snapCenter: true },
    'Delete Last unexpectedly disabled Center mode');

  assert.equal(manager.addVertexAt(180, 90), true, 'second midpoint insertion failed');
  added = manager.mesh.getVertex(manager.addVertexMode.vertexIds.at(-1));
  assert.deepEqual([added.x, added.y, added.z], midpoint, 'Center did not persist after Delete Last');

  manager.setAddVertexCenterSnap(false);
  assert.deepEqual(manager.updates.at(-1), { count: 1, snapCenter: false });
  edge = manager.mesh.getEdges()[0];
  a = manager.mesh.getVertex(edge.v1); b = manager.mesh.getVertex(edge.v2);
  assert.equal(manager.addVertexAt(30, 40), true, 'normal insertion failed');
  added = manager.mesh.getVertex(manager.addVertexMode.vertexIds.at(-1));
  const usual = [
    a.x + (b.x - a.x) * 0.18,
    a.y + (b.y - a.y) * 0.18,
    a.z + (b.z - a.z) * 0.18,
  ];
  assert.deepEqual([added.x, added.y, added.z], usual,
    'Turning Center off did not restore tap-controlled placement');
  assert.equal(manager.edgeParamCalls, 1, 'Tap-controlled placement callback was not used');
  assert.deepEqual(manager.updates.at(-1), { count: 2, snapCenter: false });
  assert.equal(manager.confirmAddVertex(), true);
  assert.equal(manager.addVertexMode, null);
  assert.equal(manager.history.length, 1, 'Session was not saved to undo history');
  assert.equal(manager.updates.at(-1), null);

  manager.enterAddVertexMode();
  assert.deepEqual(manager.updates.at(-1), { count: 0, snapCenter: false },
    'Center mode should default off for a new tool session');
  manager.cancelAddVertex();
  assert.equal(manager.updates.at(-1), null);

  console.log('PASS: midpoint exact, toggle state, Delete Last, normal placement, undo, session reset');
} finally {
  await server.close();
}
