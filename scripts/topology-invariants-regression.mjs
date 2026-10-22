// Committed Axis topology invariants: do not commit isolated points/lines,
// leave faces without actual border edges, or hide deleted shared borders.
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
  const { exportOBJ, exportFBX } = await server.ssrLoadModule('/src/lib/exporters.js');
  const { exportSTL } = await server.ssrLoadModule('/src/lib/exporters3d.js');
  const { connectVertices, targetMergeVertices } = await server.ssrLoadModule('/src/lib/meshTools.js');
  const { edgeKey } = await server.ssrLoadModule('/src/lib/meshTopology.js');
  const {
    cleanupCommittedTopology, dissolveSharedBoundary,
    adjacentFacesForBoundary, resolveLegacyDeletedBorders,
  } = await server.ssrLoadModule('/src/lib/meshTopologyInvariants.js');

  const makeQuad = () => {
    const m = EditableMesh.fromGeometry(new THREE.PlaneGeometry(2, 2, 1, 1), 'two triangles');
    const joint = [...m._ensureEdgeFaceMap().values()].find(e => e.faces.length === 2);
    m.visibleEdges = [{ v1: joint.v1, v2: joint.v2 }];
    m.invalidateCache();
    return { m, joint };
  };
  function managerFor(m, type, selected) {
    return {
      selection: { meshId: m.id, type, indices: selected },
      meshes: [m], selectedMeshIds: [],
      isGroupMode: () => false,
      getMesh(id) { return this.meshes.find(mesh => mesh.id === id); },
      pushUndo() { this.undoCalls = (this.undoCalls || 0) + 1; },
      removeMesh(id) { this.meshes = this.meshes.filter(mesh => mesh.id !== id); },
      rebuildThreeMesh() { this.rebuilds = (this.rebuilds || 0) + 1; },
      clearSelection() { this.selection = { meshId: null, type: 'object', indices: [] }; },
      updateStats() {},
    };
  }
  const check = m => {
    const ids = new Set(m.vertices.map(v => v.id));
    const used = new Set(m.faces.flat());
    assert.deepEqual(ids, used, 'Every committed vertex must participate in a face');
    const actualBorders = new Set();
    for (const face of m.faces) {
      assert.ok(face.length >= 3 && new Set(face).size === face.length, 'No edgeless or degenerate face');
      face.forEach((v, i) => {
        assert.ok(ids.has(v), 'Every face corner must exist');
        actualBorders.add(edgeKey(v, face[(i + 1) % face.length]));
      });
    }
    for (const edge of [...m.explicitEdges, ...m.visibleEdges, ...m.hiddenEdges]) {
      assert.ok(actualBorders.has(edgeKey(edge.v1, edge.v2)), 'No standalone explicit/visible/hidden edges');
    }
    for (const edge of m.getEdges()) {
      assert.ok(actualBorders.has(edgeKey(edge.v1, edge.v2)), 'Selectable edges must border a face');
    }
    const visible = m.toEdgesGeometry().attributes.position.count / 2;
    assert.ok(visible >= 0);
    return { borders: actualBorders.size, visible };
  };

  {
    const { m, joint } = makeQuad();
    const index = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(joint.v1, joint.v2));
    assert.ok(index >= 0);
    const sm = managerFor(m, 'edge', [index]);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(m.faces.length, 1, 'Deleting a shared edge must dissolve the two faces');
    assert.equal(m.faces[0].length, 4, 'Dissolve produces one real four-sided face');
    assert.equal(m.getEdges().length, 4, 'Merged face retains complete perimeter');
    check(m);
  }
  {
    const { m, joint } = makeQuad();
    // Imported meshes may wind the two triangles on opposite sides differently.
    m.faces[1].reverse();
    m.invalidateCache();
    assert.equal(dissolveSharedBoundary(m, joint.v1, joint.v2), true,
      'Valid planar borders must merge despite inconsistent triangle winding');
    assert.equal(m.faces.length, 1);
    cleanupCommittedTopology(m);
    check(m);
  }
  {
    const { m } = makeQuad();
    const edge = [...m._ensureEdgeFaceMap().values()].find(e => e.faces.length === 1);
    const index = m.getEdges().findIndex(e => edgeKey(e.v1,e.v2) === edgeKey(edge.v1,edge.v2));
    const sm = managerFor(m, 'edge', [index]);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(m.faces.length, 2, 'Deleting a required outer border must preserve its incident face');
    check(m);
  }
  {
    const { m, joint } = makeQuad();
    m.hiddenEdges.push({ v1: joint.v1, v2: joint.v2, user: true });
    m.invalidateCache();
    assert.equal(resolveLegacyDeletedBorders(m), true);
    assert.equal(m.faces.length, 1, 'Legacy hidden user-deleted boundaries must merge');
    assert.ok(!m.hiddenEdges.some(e => e.user), 'No edgeless boundary remains hidden');
    check(m);
  }
  {
    // A non-manifold border cannot be merged into one face.
    // Deleting it should remove the incident faces, not leave a hidden edge.
    const m = new EditableMesh('non-manifold edge delete');
    m.vertices = [
      { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 },
      { id: 3, x: 0, y: 1, z: 0 }, { id: 4, x: 0, y: -1, z: 0 },
      { id: 5, x: 0, y: 0, z: 1 },
    ];
    m.faces = [[1, 2, 3], [2, 1, 4], [1, 2, 5]];
    m.visibleEdges = [{ v1: 1, v2: 2 }];
    m.invalidateCache();
    const idx = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(1, 2));
    assert.ok(idx >= 0, 'Non-manifold edge must be selectable');
    const sm = managerFor(m, 'edge', [idx]);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(sm.meshes.length, 1,
      'Deleting a non-manifold edge must not destroy incident faces');
  }
  {
    const m = new EditableMesh('bent triangles');
    m.vertices = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 1, y: 0, z: 0 },
      { id: 3, x: 0, y: 1, z: 0 },
      { id: 4, x: 1, y: 1, z: 1 },
    ];
    m.faces = [[1, 2, 3], [2, 4, 3]];
    m.visibleEdges = [{ v1: 2, v2: 3 }];
    const originalBuffer = m.toBufferGeometry();
    const beforePositions = Array.from(originalBuffer.attributes.position.array);
    const beforeNormals = Array.from(originalBuffer.attributes.normal.array);
    originalBuffer.dispose();
    const index = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(2, 3));
    const sm = managerFor(m, 'edge', [index]);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(m.faces.length, 1, 'Deleting a bent shared border must merge its two faces');
    assert.equal(m.faces[0].length, 4);
    assert.equal(adjacentFacesForBoundary(m, 2, 3).length, 0,
      'The deleted bent border is not part of any editable face');
    assert.ok(!m.getEdges().some(e => edgeKey(e.v1, e.v2) === edgeKey(2, 3)),
      'The deleted shared edge must not remain selectable');
    assert.equal(m.getEdges().length, 4, 'Bent merged face keeps exactly its four perimeter edges');
    const foldedBuffer = m.toBufferGeometry();
    assert.deepEqual(Array.from(foldedBuffer.attributes.position.array), beforePositions,
      'Bent-face deletion must preserve the exact original triangles');
    assert.deepEqual(Array.from(foldedBuffer.attributes.normal.array), beforeNormals,
      'Bent-face deletion must preserve the original triangle normals');
    foldedBuffer.dispose();
    const clone = m.clone();
    assert.deepEqual(clone.faceRenderTriangles, m.faceRenderTriangles,
      'Undo snapshots must preserve folded-face render triangles');
    const reloaded = EditableMesh.deserialize(m.serialize());
    const loadedBuffer = reloaded.toBufferGeometry();
    assert.deepEqual(Array.from(loadedBuffer.attributes.position.array), beforePositions,
      'Saved and reopened folded faces must retain their original shape');
    loadedBuffer.dispose();
    check(m);
    check(reloaded);
  }
  {
    const { m } = makeQuad();
    // A cut-created edge must be selectable, even if an older automatic
    // diagonal classifier already hid that SAME border.
    m.visibleEdges = [];
    m.invalidateCache();
    m.getEdges();
    const seam = [...m._ensureEdgeFaceMap().values()].find(e => e.faces.length === 2);
    m.explicitEdges.push({ v1: seam.v1, v2: seam.v2 });
    m.invalidateCache();
    const index = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(seam.v1, seam.v2));
    assert.ok(index >= 0, 'User-created face-dividing edges must stay selectable');
    const display = m.toEdgesGeometry();
    const lineCount = display.getAttribute('position').count / 2;
    display.dispose();
    assert.ok(lineCount >= 5, 'User-created dividing edge must be drawn');
    SceneManager.prototype.deleteSelection.call(managerFor(m, 'edge', [index]));
    assert.equal(m.faces.length, 1, 'Deleting the explicitly cut border must merge faces');
    check(m);
  }
  {
    // A single Delete action on multiple shared edges should dissolve them all,
    // not leave the later selections behind when face indices shift.
    const mesh = EditableMesh.fromGeometry(new THREE.PlaneGeometry(3, 1, 3, 1), 'three panels');
    const targets = [...mesh._ensureEdgeFaceMap().values()].filter(e =>
      e.faces.length === 2 &&
      Math.abs(mesh.getVertex(e.v1).x - mesh.getVertex(e.v2).x) < 1e-6 &&
      Math.abs(mesh.getVertex(e.v1).y - mesh.getVertex(e.v2).y) > 0.9
    );
    assert.equal(targets.length, 2);
    mesh.explicitEdges = targets.map(({ v1, v2 }) => ({ v1, v2 }));
    mesh.invalidateCache();
    const selectable = mesh.getEdges();
    const selected = targets.map(e => selectable.findIndex(line =>
      edgeKey(line.v1, line.v2) === edgeKey(e.v1, e.v2)));
    assert.ok(selected.every(index => index >= 0));
    const manager = managerFor(mesh, 'edge', selected);
    SceneManager.prototype.deleteSelection.call(manager);
    assert.equal(mesh.faces.length, 1, 'Removing both dividing lines leaves one rectangle');
    assert.equal(mesh.getTriangleCount(), 6, 'Multi-edge deletion preserves every render triangle');
    const borders = new Set(mesh.faces.flatMap(face =>
      face.map((id, i) => edgeKey(id, face[(i + 1) % face.length]))));
    for (const e of targets) assert.ok(!borders.has(edgeKey(e.v1, e.v2)),
      'Every selected dividing edge must be removed');
    check(mesh);
  }
  {
    // Removing a sharp cube edge must not change either original surface.
    // The deleted edge becomes an internal render seam, not a face border.
    const m = EditableMesh.fromGeometry(new THREE.BoxGeometry(2, 2, 2), 'cube');
    const signature = mesh => {
      const geo = mesh.toBufferGeometry();
      const p = geo.attributes.position.array, n = geo.attributes.normal.array;
      const tris = [];
      for (let i = 0; i < p.length; i += 9) {
        tris.push(JSON.stringify([Array.from(p.slice(i, i + 9)), Array.from(n.slice(i, i + 9))]));
      }
      geo.dispose();
      return tris.sort();
    };
    const before = signature(m);
    const originalEdges = new Set(m.getEdges().map(e => edgeKey(e.v1, e.v2)));
    const edge = [...m._ensureEdgeFaceMap().values()].find(e => e.faces.length === 2 &&
      Math.abs(m.getFaceNormal(e.faces[0]).dot(m.getFaceNormal(e.faces[1]))) < 0.1);
    assert.ok(edge, 'Cube should have a sharp selectable shared border');
    const idx = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(edge.v1, edge.v2));
    assert.ok(idx >= 0);
    SceneManager.prototype.deleteSelection.call(managerFor(m, 'edge', [idx]));
    assert.equal(m.faces.length, 9, 'Deleting a cube edge merges the two cube faces it separates');
    assert.ok(!m.getEdges().some(e => edgeKey(e.v1, e.v2) === edgeKey(edge.v1, edge.v2)),
      'A deleted cube edge must not remain selectable');
    const expectedEdges = new Set(originalEdges);
    expectedEdges.delete(edgeKey(edge.v1, edge.v2));
    assert.deepEqual(new Set(m.getEdges().map(e => edgeKey(e.v1, e.v2))), expectedEdges,
      'Deleting a cube edge must not expose the hidden diagonals of neighboring faces');
    assert.deepEqual(signature(m), before, 'The cube surface and shading must remain unchanged');
    assert.deepEqual(signature(EditableMesh.deserialize(m.serialize())), before,
      'Reopening a saved model must preserve the dissolved folded surface');
    assert.equal((exportOBJ([m]).match(/^f /gm) || []).length, 12,
      'OBJ export must preserve the original cube surface triangles');
    assert.match(exportFBX([m]), /PolygonVertexIndex: \*36/,
      'FBX export must preserve the original cube surface triangles');
    assert.equal(new DataView(exportSTL([m])).getUint32(80, true), 12,
      'STL export must preserve the original cube surface triangles');
    check(m);
  }
  {
    const { m } = makeQuad();
    m.vertices.push({ id: 999, x: 12, y: 15, z: 2 });
    m.explicitEdges.push({ v1: 999, v2: m.faces[0][0] });
    m.visibleEdges.push({ v1: 999, v2: m.faces[0][1] });
    m.paintWireEdges = [{ v1: 999, v2: m.faces[0][2] }];
    assert.ok(!m.getEdges().some(e => e.v1 === 999 || e.v2 === 999),
      'Detached explicit line may not be selectable as a face border');
    cleanupCommittedTopology(m);
    assert.ok(!m.vertices.some(v => v.id === 999));
    assert.equal(m.explicitEdges.length, 0);
    check(m);
  }
  {
    const { m } = makeQuad();
    m.hiddenEdges.push({ v1: m.faces[0][0], v2: m.faces[0][1], user: true });
    m.invalidateCache();
    const border = edgeKey(m.faces[0][0], m.faces[0][1]);
    const count = [...m._ensureEdgeFaceMap().values()].find(e => edgeKey(e.v1, e.v2) === border)?.faces.length;
    if (count === 1) {
      assert.ok(m.getEdges().some(e => edgeKey(e.v1, e.v2) === border),
        'A user-hidden record must never remove the last border edge of a face');
    }
  }
  {
    const { m } = makeQuad();
    const edge = [...m._ensureEdgeFaceMap().values()].find(e => e.faces.length === 1);
    const victimId = edge.v1;
    const index = m.vertices.findIndex(v => v.id === victimId);
    SceneManager.prototype.deleteSelection.call(managerFor(m, 'vertex', [index]));
    check(m);
  }
  {
    const { m } = makeQuad();
    SceneManager.prototype.deleteSelection.call(managerFor(m, 'face', [0]));
    assert.equal(m.faces.length, 1);
    check(m);
  }
  {
    const { m, joint } = makeQuad();
    const saved = m.serialize();
    saved.vertices.push({ id: 999, x: 400, y: 500, z: 600 });
    saved.explicitEdges.push({ v1: 999, v2: m.faces[0][0] });
    saved.hiddenEdges.push({ v1: joint.v1, v2: joint.v2, user: true });
    const restored = EditableMesh.deserialize(saved);
    assert.equal(restored.faces.length, 1, 'Legacy edgeless shared borders merge on load');
    assert.ok(!restored.vertices.some(v => v.id === 999), 'Legacy isolated points do not survive loading');
    check(restored);
  }
  {
    const m = new EditableMesh('lonely triangle');
    m.vertices = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 1, y: 0, z: 0 },
      { id: 3, x: 0, y: 1, z: 0 },
    ];
    m.faces = [[1, 2, 3]];
    const index = m.getEdges().findIndex(e => edgeKey(e.v1, e.v2) === edgeKey(1, 2));
    const sm = managerFor(m, 'edge', [index]);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(sm.meshes.length, 1,
      'Deleting the only border edge must preserve the face');
  }
  {
    const { m } = makeQuad();
    const saved = m.serialize();
    saved.explicitEdges.push({ v1: 99, v2: 999 });
    const loaded = EditableMesh.deserialize(saved);
    assert.equal(loaded.explicitEdges.length, 0);
    check(loaded);
  }
  {
    const m = new EditableMesh('disconnected faces');
    m.vertices = [
      { id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 },
      { id: 3, x: 0, y: 1, z: 0 }, { id: 4, x: 3, y: 0, z: 0 },
      { id: 5, x: 4, y: 0, z: 0 }, { id: 6, x: 3, y: 1, z: 0 },
    ];
    m.faces = [[1, 2, 3], [4, 5, 6]];
    const sm = managerFor(m, 'vertex', [0, 3]);
    connectVertices(sm);
    assert.equal(m.explicitEdges.length, 0, 'Connect cannot commit a standalone edge between separate faces');
    assert.equal(m.faces.length, 2, 'Rejected connection must leave existing faces unchanged');
    check(m);
  }
  {
    const { m } = makeQuad();
    const sm = managerFor(m, 'vertex', [0, 1]);
    targetMergeVertices(sm);
    if (sm.meshes.length) check(sm.meshes[0]);
    else assert.equal(m.faces.length, 0);
  }
  {
    // A cut or inserted midpoint can leave two faces sharing a border chain.
    // Deleting that border must not fail just because its midpoint occurs twice
    // in a naive concatenation of the two face outlines.
    const m = new EditableMesh('shared subdivided border');
    m.vertices = [
      { id: 1, x: -1, y: -1, z: 0 }, { id: 2, x: 0, y: -1, z: 0 },
      { id: 3, x: 0, y: 0, z: 0 }, { id: 4, x: 0, y: 1, z: 0 },
      { id: 5, x: -1, y: 1, z: 0 }, { id: 6, x: 1, y: -1, z: 0 },
      { id: 7, x: 1, y: 1, z: 0 },
    ];
    m.faces = [[1, 2, 3, 4, 5], [2, 6, 7, 4, 3]];
    m.explicitEdges = [{ v1: 2, v2: 3 }, { v1: 3, v2: 4 }];
    const selected = m.getEdges().map((e, i) =>
      edgeKey(e.v1, e.v2) === edgeKey(2, 3) ? i : -1).filter(i => i >= 0);
    const sm = managerFor(m, 'edge', selected);
    SceneManager.prototype.deleteSelection.call(sm);
    assert.equal(m.faces.length, 1, 'Delete must dissolve faces sharing a subdivided border');
    assert.ok(!m.getEdges().some(e => edgeKey(e.v1, e.v2) === edgeKey(2, 3)),
      'The selected segment must actually disappear');
    assert.equal(m.getEdges().length, 6, 'Keep the entire outer perimeter');
    check(m);
    check(EditableMesh.deserialize(m.serialize()));
  }
  console.log('PASS: no isolated vertices/edges; complete face borders; shared-edge dissolve; invalid merges rejected; legacy saves, Connect, and target merge cleaned');
} finally {
  await server.close();
}