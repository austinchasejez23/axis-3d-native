// Edge picking ignores geometry behind the camera. Zoomed in on one object,
// taps used to select edges of objects behind the camera, because a point
// behind the camera projects flipped across the screen and its occlusion ray
// hits nothing.
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
  const { SceneManager } = await server.ssrLoadModule('/src/lib/SceneManager.js');
  const P = SceneManager.prototype;
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.05, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  let nextId = 900000;
  const tri = (a, b, c) => {
    const m = new EditableMesh('tri');
    for (const p of [a, b, c]) m.vertices.push({ id: nextId++, ...p });
    m.faces.push(m.vertices.map((v) => v.id));
    m.invalidateCache();
    return m;
  };
  const scene = (meshes) => ({
    camera, meshes, raycaster: new THREE.Raycaster(), threeObjects: new Map(), cameraDist: 5,
    getWorldMatrix: () => new THREE.Matrix4(),
    isWorldPointVisible: P.isWorldPointVisible,
  });
  // Entirely behind the camera, crossing the view axis.
  const behind = tri({ x: -1, y: 0, z: 3 }, { x: 1, y: 0, z: 3 }, { x: 0, y: 1, z: 3 });
  assert.equal(behind.getEdges().length, 3, 'test edges exist');
  assert.equal(P.findClosestEdge.call(scene([behind]), 0, 0), null, 'an edge behind the camera is not picked');
  // Passing beside the camera: its front part is far off to the side.
  const beside = tri({ x: 0.2, y: 0, z: 4 }, { x: 3, y: 0, z: -2 }, { x: 3, y: 0.01, z: -2 });
  assert.equal(P.findClosestEdge.call(scene([beside]), 0, 0), null, 'the behind-camera part of an edge is not picked');
  // A visible edge in front is still picked, even with the others present.
  const front = tri({ x: -1, y: 0, z: -5 }, { x: 1, y: 0, z: -5 }, { x: 0, y: -1, z: -5 });
  const hit = P.findClosestEdge.call(scene([behind, beside, front]), 0, 0.01);
  assert.ok(hit && hit.meshId === front.id, 'the edge in front is picked');
  console.log('Edge picking ignores geometry behind the camera.');
} finally {
  await server.close();
}
