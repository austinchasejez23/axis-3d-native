import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Imported and locally created meshes must share the same optional fields.
// Missing constructor defaults otherwise change how undo/clone and storage
// behave depending on whether a model was created or restored.
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
  const mesh = new EditableMesh('defaults');
  assert.equal(mesh.primitiveParams, null);
  assert.equal(mesh.textureMergeColor, false);
  assert.equal(mesh._paintDense, false);

  const copiedDefaults = mesh.clone();
  assert.equal(copiedDefaults.primitiveParams, null);
  assert.equal(copiedDefaults.textureMergeColor, false);
  assert.equal(copiedDefaults._paintDense, false);

  mesh.primitiveParams = { turns: 3, insideDiameter: 0.5 };
  mesh.textureMergeColor = true;
  const copied = mesh.clone();
  assert.deepEqual(copied.primitiveParams, mesh.primitiveParams);
  assert.notEqual(copied.primitiveParams, mesh.primitiveParams);
  assert.equal(copied.textureMergeColor, true);

  // Undo snapshots use clone(); losing this flag changes paint-wire rendering.
  mesh._paintDense = true;
  mesh.paintWireEdges = [{ v1: 1, v2: 2 }];
  const paintedCopy = mesh.clone();
  assert.equal(paintedCopy._paintDense, true);
  assert.deepEqual(paintedCopy.paintWireEdges, mesh.paintWireEdges);
  assert.notEqual(paintedCopy.paintWireEdges, mesh.paintWireEdges);
  mesh._paintDense = false;
  mesh.paintWireEdges = null;

  const restored = EditableMesh.deserialize(mesh.serialize());
  assert.deepEqual(restored.primitiveParams, mesh.primitiveParams);
  assert.equal(restored.textureMergeColor, true);
  assert.equal(restored._paintDense, false);

  console.log('PASS: new, cloned and restored meshes preserve optional primitive and material fields');
} finally {
  await server.close();
}
