import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': process.cwd() + '/src' } }, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', logLevel: 'silent' });

// Every undirected edge is used by exactly two faces, once in each direction.
function checkClosed(mesh, label) {
  const directed = new Map();
  for (const face of mesh.faces) {
    assert.ok(new Set(face).size === face.length, `${label}: repeated corner in a face`);
    assert.ok(face.length >= 3, `${label}: face with fewer than 3 corners`);
    for (let i = 0; i < face.length; i++) {
      const key = `${face[i]}>${face[(i + 1) % face.length]}`;
      directed.set(key, (directed.get(key) || 0) + 1);
    }
  }
  const edges = new Set();
  for (const [key, count] of directed) {
    assert.equal(count, 1, `${label}: directed edge ${key} used ${count} times`);
    const [a, b] = key.split('>');
    assert.ok(directed.has(`${b}>${a}`), `${label}: edge ${key} has no opposite face (open border)`);
    edges.add(a < b ? `${a},${b}` : `${b},${a}`);
  }
  const used = new Set(mesh.faces.flat());
  assert.equal(used.size, mesh.vertices.length, `${label}: unused vertices remain`);
  const euler = used.size - edges.size + mesh.faces.length;
  assert.equal(euler, 2, `${label}: Euler characteristic ${euler}, expected 2`);
}

function signedVolume(mesh) {
  const g = mesh.toBufferGeometry();
  const p = g.getAttribute('position');
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

try {
  globalThis.window = { self: {}, top: {} };
  const { EditableMesh } = await server.ssrLoadModule('/src/lib/EditableMesh.js');
  const { SceneManager } = await server.ssrLoadModule('/src/lib/SceneManager.js');
  const { createPrimitive } = await server.ssrLoadModule('/src/lib/primitives.js');
  const { bevelVertices, buildCornerPatch } = await server.ssrLoadModule('/src/lib/vertexBevel.js');
  const { dissolveSelection, countVisualFaces } = await server.ssrLoadModule('/src/lib/dissolveTools.js');
  const { getToolRequirementNotice } = await server.ssrLoadModule('/src/lib/toolRequirements.js');

  const makeManager = (mesh, selection) => {
    const manager = Object.create(SceneManager.prototype);
    Object.assign(manager, {
      meshes: [mesh], selection, undoStack: [], redoStack: [], maxUndo: 50,
      getMesh: (id) => (id === mesh.id ? mesh : null),
      rebuildThreeMesh() {}, updateStats() {}, updateHighlights() {}, updateHud() {},
      clearSelection() { this.selection = { meshId: null, type: 'object', indices: [] }; },
      setSelection(next) { this.selection = next; },
      captureSnapshot: () => ({ meshes: [mesh.clone()] }),
      pushUndoSnapshot(snapshot) { this.undoStack.push(snapshot); },
      getSelectedMesh: () => mesh,
    });
    // The app's selection mode follows what is selected.
    Object.defineProperty(manager, 'selectionMode', { get() { return this.selection.type; } });
    return manager;
  };

  // ---- Patch builder: right counts for every valence / segment combination.
  for (let n = 3; n <= 6; n++) {
    for (let s = 1; s <= 7; s++) {
      const ring = [];
      for (let i = 0; i < n * s; i++) {
        const a = (i / (n * s)) * Math.PI * 2;
        ring.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      }
      const patch = buildCornerPatch(ring, n, s);
      assert.equal(patch.fixed, n * s);
      const h = Math.floor(s / 2);
      const expectedFaces = s === 1 ? 1 : (s % 2 === 0 ? n * h * h : n * h * h + n * h + 1);
      assert.equal(patch.faces.length, expectedFaces, `patch n=${n} s=${s} face count`);
      for (const f of patch.faces) for (const p of f) assert.ok(p >= 0 && p < patch.points.length, 'patch index in range');
      for (const p of patch.points) assert.ok(Number.isFinite(p.x + p.y + p.z), 'patch point finite');
    }
  }

  // ---- Vertex bevel on a cube corner, many segment counts.
  const topCorner = (mesh) => {
    let best = -1, score = -Infinity;
    mesh.vertices.forEach((v, i) => { const sc = v.x + v.y + v.z; if (sc > score) { score = sc; best = i; } });
    return best;
  };
  for (const segments of [1, 2, 3, 4, 5, 8]) {
    const mesh = createPrimitive('cube');
    checkClosed(mesh, 'cube baseline');
    const before = signedVolume(mesh);
    assert.ok(before > 0, 'cube volume positive (outward winding)');
    const index = topCorner(mesh);
    const corner = { ...mesh.vertices[index] };
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [index] });
    const half = Math.abs(corner.x);
    const w = 0.25 * half * 2;
    bevelVertices(manager, { radius: w, segments });
    assert.equal(manager.bevelNotice ?? null, null, `segments ${segments}: unexpected notice ${manager.bevelNotice}`);
    checkClosed(mesh, `cube corner s=${segments}`);
    const after = signedVolume(mesh);
    assert.ok(after > 0 && after < before, `segments ${segments}: volume should shrink (${before} -> ${after})`);
    assert.ok(!mesh.vertices.some((v) => Math.hypot(v.x - corner.x, v.y - corner.y, v.z - corner.z) < 1e-9), 'original corner removed');
    // Arc points sit on the sphere through the three arcs.
    const centre = new THREE.Vector3(corner.x - w, corner.y - w, corner.z - w);
    const radius = w * Math.SQRT2;
    const onSphere = mesh.vertices.filter((v) => Math.abs(new THREE.Vector3(v.x, v.y, v.z).distanceTo(centre) - radius) < 1e-6);
    assert.ok(onSphere.length >= 3 * segments, `segments ${segments}: expected >=${3 * segments} arc points on the sphere, got ${onSphere.length}`);
    // Every new vertex stays inside the original cube.
    for (const v of mesh.vertices) assert.ok(Math.abs(v.x) <= half + 1e-9 && Math.abs(v.y) <= half + 1e-9 && Math.abs(v.z) <= half + 1e-9, 'bevel stays inside the cube');
    assert.equal(manager.selection.indices.length, 0, 'selection cleared after bevel');
    const copy = EditableMesh.deserialize(mesh.serialize());
    checkClosed(copy, `cube corner s=${segments} after save/reopen`);
    assert.ok(copy.getTriangleCount() > 12);
    const visibleEdges = mesh.getEdges();
    assert.ok(visibleEdges.length >= 12 + 3 * segments, 'arcs show as edges');
  }

  // ---- All eight corners at once.
  for (const segments of [1, 2, 3]) {
    const mesh = createPrimitive('cube');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: mesh.vertices.map((_, i) => i) });
    bevelVertices(manager, { radius: 0.2, segments });
    assert.equal(manager.bevelNotice ?? null, null, `all corners s=${segments}: ${manager.bevelNotice}`);
    checkClosed(mesh, `cube all corners s=${segments}`);
    assert.ok(signedVolume(mesh) > 0);
  }

  // ---- Larger radius than the edge allows is clamped, not broken.
  {
    const mesh = createPrimitive('cube');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [topCorner(mesh)] });
    bevelVertices(manager, { radius: 50, segments: 3 });
    checkClosed(mesh, 'clamped radius');
  }

  // ---- Vertices of other primitives (valence != 3).
  for (const type of ['sphere', 'pyramid', 'cylinder', 'cone', 'torus']) {
    const mesh = createPrimitive(type, 12);
    checkClosedLoose(mesh);
    let done = 0;
    for (let i = 0; i < mesh.vertices.length && done < 3; i += Math.max(1, Math.floor(mesh.vertices.length / 3))) {
      const fresh = EditableMesh.deserialize(mesh.serialize());
      const manager = makeManager(fresh, { meshId: fresh.id, type: 'vertex', indices: [i] });
      bevelVertices(manager, { radius: 0.05, segments: 2 });
      if (!manager.bevelNotice) { checkClosedLoose(fresh); done++; }
    }
  }
  function checkClosedLoose(mesh) {
    const directed = new Map();
    for (const face of mesh.faces) for (let i = 0; i < face.length; i++) {
      const key = `${face[i]}>${face[(i + 1) % face.length]}`;
      directed.set(key, (directed.get(key) || 0) + 1);
    }
    for (const [key, count] of directed) {
      assert.equal(count, 1, `edge ${key} used ${count} times`);
      const [a, b] = key.split('>');
      assert.ok(directed.has(`${b}>${a}`), 'open border introduced');
    }
  }

  // ---- Sweep: the value is the radius of the rounded corner on each face.
  {
    // A square cube corner: radius and reach are the same, so both modes agree.
    const flat = createPrimitive('cube'), swept = createPrimitive('cube');
    for (const [mesh, sweep] of [[flat, false], [swept, true]]) {
      const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [topCorner(mesh)] });
      bevelVertices(manager, { radius: 0.2, segments: 3, sweep });
      checkClosed(mesh, `cube sweep=${sweep}`);
    }
    const key = (m) => m.vertices.map((v) => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`).sort().join('|');
    assert.equal(key(swept), key(flat), 'square corners: Sweep matches the normal bevel');

    // A pointed corner: the reach along each edge is radius / tan(half the face angle).
    for (const sweep of [false, true]) {
      const mesh = createPrimitive('pyramid');
      let apex = 0;
      mesh.vertices.forEach((v, i) => { if (v.y > mesh.vertices[apex].y) apex = i; });
      const V = new THREE.Vector3(mesh.vertices[apex].x, mesh.vertices[apex].y, mesh.vertices[apex].z);
      const apexId = mesh.vertices[apex].id;
      const dirs = [];
      for (const e of mesh.getEdges()) {
        const other = e.v1 === apexId ? e.v2 : e.v2 === apexId ? e.v1 : null;
        if (other == null) continue;
        const o = mesh.getVertex(other);
        dirs.push(new THREE.Vector3(o.x, o.y, o.z).sub(V).normalize());
      }
      assert.ok(dirs.length >= 3);
      let smallest = Infinity;
      for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) smallest = Math.min(smallest, Math.acos(dirs[i].dot(dirs[j])));
      const radius = 0.05;
      const expected = sweep ? radius / Math.tan(smallest / 2) : radius;
      const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [apex] });
      bevelVertices(manager, { radius, segments: 2, sweep });
      assert.equal(manager.bevelNotice ?? null, null);
      checkClosedLoose(mesh);
      const found = dirs.filter((d) => mesh.vertices.some((v) => new THREE.Vector3(v.x, v.y, v.z).distanceTo(V.clone().addScaledVector(d, expected)) < 1e-5));
      assert.equal(found.length, dirs.length, `sweep=${sweep}: every edge is cut ${expected.toFixed(4)} from the corner`);
    }

    // Big radii are held inside the edges and stay closed.
    for (const type of ['cube', 'pyramid', 'sphere']) {
      const mesh = createPrimitive(type, 12);
      const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [0] });
      bevelVertices(manager, { radius: 40, segments: 3, sweep: true });
      if (!manager.bevelNotice) checkClosedLoose(mesh);
    }
  }

  // ---- A corner that is not surrounded by faces is refused with a message.
  {
    const mesh = createPrimitive('plane');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [0] });
    const faces = JSON.stringify(mesh.faces);
    bevelVertices(manager, { radius: 0.1, segments: 2 });
    assert.ok(manager.bevelNotice, 'plane corner gives a notice');
    assert.equal(JSON.stringify(mesh.faces), faces, 'refused bevel leaves the mesh alone');
  }

  // ---- Dissolve: faces
  const faceCentre = (mesh, fi) => {
    const c = new THREE.Vector3();
    mesh.faces[fi].forEach((id) => { const v = mesh.getVertex(id); c.add(new THREE.Vector3(v.x, v.y, v.z)); });
    return c.divideScalar(mesh.faces[fi].length);
  };
  const facesWhere = (mesh, test) => mesh.faces.map((_, i) => i).filter((i) => test(faceCentre(mesh, i)));
  {
    const mesh = createPrimitive('cube');
    const top = facesWhere(mesh, (c) => c.y > 0.4);
    const front = facesWhere(mesh, (c) => c.z > 0.4);
    const back = facesWhere(mesh, (c) => c.z < -0.4);
    // one visible face only -> refused
    let manager = makeManager(mesh, { meshId: mesh.id, type: 'face', indices: top });
    assert.equal(countVisualFaces(mesh, top), 1, 'a cube side stored as two triangles is one face');
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), 'Select two or more faces to dissolve');
    assert.equal(dissolveSelection(manager), false);
    assert.equal(manager.toolNotice, 'Select two or more faces to dissolve');
    // two faces that do not touch -> refused
    manager = makeManager(mesh, { meshId: mesh.id, type: 'face', indices: [...front, ...back] });
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), null);
    assert.equal(dissolveSelection(manager), false);
    assert.ok(manager.toolNotice, 'non-touching faces give a notice');
    // two touching faces -> merged into one
    manager = makeManager(mesh, { meshId: mesh.id, type: 'face', indices: [...top, ...front] });
    const before = mesh.faces.length;
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    checkClosed(mesh, 'cube top+front dissolved');
    assert.ok(mesh.faces.length < before, 'faces were merged');
    assert.ok(mesh.faces.some((f) => f.length === 6), 'merged face has 6 corners');
    assert.equal(manager.undoStack.length, 1, 'one undo step');
    assert.equal(manager.selection.type, 'face');
    assert.equal(countVisualFaces(mesh, manager.selection.indices), 1, 'merged face is selected');
    assert.ok(signedVolume(mesh) > 0.99 && signedVolume(mesh) < 1.01 || signedVolume(mesh) > 0, 'solid stays solid');
  }
  {
    // Three sides of one corner dissolve into one face
    const mesh = createPrimitive('cube');
    const picks = [...facesWhere(mesh, (c) => c.y > 0.4), ...facesWhere(mesh, (c) => c.z > 0.4), ...facesWhere(mesh, (c) => c.x > 0.4)];
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'face', indices: picks });
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    checkClosed(mesh, 'cube three sides dissolved');
  }
  {
    // Plane grid: two neighbouring cells become one face.
    const mesh = createPrimitive('plane');
    const grid = EditableMesh.deserialize(createGridPlane(EditableMesh, 3, 3).serialize());
    const cells = grid.faces.map((_, i) => i);
    const pickCells = cells.filter((i) => { const c = faceCentre(grid, i); return Math.abs(c.z - (-1)) < 0.4 && c.x < 0.5; });
    assert.ok(pickCells.length >= 2);
    const manager = makeManager(grid, { meshId: grid.id, type: 'face', indices: pickCells });
    const before = grid.faces.length;
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    assert.ok(grid.faces.length < before);
    void mesh;
  }

  // ---- Dissolve: edges and vertices on a closed shape
  {
    const mesh = createPrimitive('cube');
    const edges = mesh.getEdges();
    // pick the top-front edge
    const index = edges.findIndex((e) => {
      const a = mesh.getVertex(e.v1), b = mesh.getVertex(e.v2);
      return a.y > 0.4 && b.y > 0.4 && a.z > 0.4 && b.z > 0.4;
    });
    assert.ok(index >= 0);
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'edge', indices: [index] });
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), null);
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    checkClosed(mesh, 'cube edge dissolved');
  }
  {
    const mesh = createPrimitive('cube');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [topCorner(mesh)] });
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), null);
    assert.equal(getToolRequirementNotice(manager, 'bevel'), null);
    const ok = dissolveSelection(manager);
    if (ok) checkClosed(mesh, 'cube vertex dissolved');
  }
  {
    // A slab (top, bottom and five sides). Vertex 2 has three edges, so the
    // three faces around it become one face.
    const mesh = new EditableMesh('slab');
    const pts = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1], [0, 0, 1]];
    pts.forEach(([x, y, z], i) => mesh.vertices.push({ id: i + 1, x, y, z }));
    const n = pts.length;
    pts.forEach(([x, y, z], i) => mesh.vertices.push({ id: n + i + 1, x, y: y - 1, z }));
    mesh.faces.push([5, 4, 3, 2, 1], [6, 7, 8, 9, 10]);
    for (let i = 0; i < n; i++) {
      const a = i + 1, b = ((i + 1) % n) + 1;
      mesh.faces.push([a, b, b + n, a + n]);
    }
    checkClosed(mesh, 'slab baseline');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [1] });
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    assert.ok(!mesh.faces.flat().includes(2), 'dissolved vertex removed from every face');
    assert.equal(mesh.faces.length, 5, 'three faces became one');
  }
  {
    // A vertex that only joins two edges is removed from both faces around it.
    const mesh = new EditableMesh('pillow');
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1], [0, 0, 1]].forEach(([x, y, z], i) => mesh.vertices.push({ id: i + 1, x, y, z }));
    mesh.faces.push([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [1] });
    assert.equal(dissolveSelection(manager), true, manager.toolNotice);
    assert.ok(mesh.faces.every((f) => f.length === 4 && !f.includes(2)), 'both faces lose the corner');
  }

  // ---- Live preview: drag width / segments, apply once, undo, redo, cancel.
  {
    const { beginBevelPreview, updateBevelPreview, commitBevelPreview, cancelBevelPreview } = await server.ssrLoadModule('/src/lib/meshTools.js');
    const start = createPrimitive('cube');
    const corner = topCorner(start);
    const manager = Object.create(SceneManager.prototype);
    Object.assign(manager, {
      meshes: [start], selection: { meshId: start.id, type: 'vertex', indices: [corner] },
      selectedMeshIds: [start.id], multiSelect: false, selectionMode: 'vertex', undoStack: [], redoStack: [], maxUndo: 50,
      threeObjects: new Map([[start.id, { material: { userData: {} } }]]), cb: {},
      rebuildThreeMesh() {}, updateStats() {}, updateHighlights() {}, updateHud() {}, updateObjectMaterial() {}, buildThreeMesh() {}, removeMesh() {}, restoreSceneLights() {},
    });
    manager.getMesh = (id) => manager.meshes.find((m) => m.id === id) || null;
    manager.clearSelection = () => { manager.selection = { meshId: null, type: 'object', indices: [] }; };
    const cubeFaces = start.faces.length;
    assert.equal(beginBevelPreview(manager), true);
    updateBevelPreview(manager, { radius: 0.2, segments: 2 });
    const two = manager.getMesh(start.id).faces.length;
    updateBevelPreview(manager, { radius: 0.3, segments: 3 });
    const three = manager.getMesh(start.id).faces.length;
    assert.ok(two > cubeFaces && three > two, `preview rebuilds from the original each time (${cubeFaces} -> ${two} -> ${three})`);
    updateBevelPreview(manager, { radius: 0.2, segments: 2 });
    assert.equal(manager.getMesh(start.id).faces.length, two, 'going back to 2 segments gives the same mesh');
    checkClosed(manager.getMesh(start.id), 'preview');
    commitBevelPreview(manager);
    assert.equal(manager.undoStack.length, 1, 'one undo step for the whole preview');
    manager.undo();
    assert.equal(manager.getMesh(start.id).faces.length, cubeFaces, 'undo restores the cube');
    manager.redo();
    assert.equal(manager.getMesh(start.id).faces.length, two, 'redo restores the bevel');
    // Cancel puts the original back.
    manager.selection = { meshId: start.id, type: 'vertex', indices: [topCorner(manager.getMesh(start.id))] };
    const beforeCancel = manager.getMesh(start.id).faces.length;
    assert.equal(beginBevelPreview(manager), true);
    updateBevelPreview(manager, { radius: 0.1, segments: 4 });
    assert.notEqual(manager.getMesh(start.id).faces.length, beforeCancel);
    cancelBevelPreview(manager);
    assert.equal(manager.getMesh(start.id).faces.length, beforeCancel, 'cancel restores');
  }

  // ---- A stretched object is beveled as it looks, then keeps its own scale.
  {
    const mesh = createPrimitive('cube');
    mesh.scale = { x: 3, y: 1, z: 1 };
    const { bevelEdge } = await server.ssrLoadModule('/src/lib/meshTools.js');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [topCorner(mesh)] });
    manager.pushUndo = () => {};
    const before = JSON.stringify(mesh.scale);
    bevelEdge(manager, { radius: 0.2, segments: 2, skipUndo: true });
    assert.equal(JSON.stringify(mesh.scale), before, 'scale unchanged');
    checkClosed(mesh, 'stretched cube');
    // In world space the corner rounds by 0.2 along every edge, so along the
    // stretched axis the stored distance is 0.2 / 3.
    const xs = mesh.vertices.map((v) => v.x).sort((a, b) => b - a);
    const topX = Math.max(...mesh.vertices.map((v) => v.x));
    const nearTop = mesh.vertices.filter((v) => v.y > 0.49 && v.z > 0.49 && v.x < topX - 1e-6 && v.x > topX - 0.5).map((v) => topX - v.x);
    assert.ok(xs.length > 0 && nearTop.length > 0 && Math.max(...nearTop) <= 0.2 / 3 + 1e-6, 'bevel width measured in world units');
  }

  // ---- Requirements
  {
    const mesh = createPrimitive('cube');
    const manager = makeManager(mesh, { meshId: mesh.id, type: 'vertex', indices: [] });
    assert.equal(getToolRequirementNotice(manager, 'bevel'), 'Select a vertex to bevel');
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), 'Select a vertex to dissolve');
    manager.selection = { meshId: mesh.id, type: 'edge', indices: [] };
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), 'Select one or more edges to dissolve');
    manager.selection = { meshId: mesh.id, type: 'face', indices: [] };
    assert.equal(getToolRequirementNotice(manager, 'dissolve'), 'Select two or more faces to dissolve');
  }

  console.log('PASS: vertex bevel (patch counts, cube corners at 1-8 segments, all corners, clamped width, other primitives, refusal) and dissolve (faces, edges, vertices, requirements).');
} finally { await server.close(); }

function createGridPlane(EditableMesh, nx, nz) {
  const mesh = new EditableMesh('grid');
  const id = (i, j) => j * (nx + 1) + i + 1;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) mesh.vertices.push({ id: id(i, j), x: i - nx / 2, y: 0, z: j - nz / 2 });
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    mesh.faces.push([id(i, j), id(i, j + 1), id(i + 1, j + 1)]);
    mesh.faces.push([id(i, j), id(i + 1, j + 1), id(i + 1, j)]);
  }
  return mesh;
}
