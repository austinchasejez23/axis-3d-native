import { EditableMesh } from './EditableMesh';
import * as THREE from 'three';
import { newVid, edgeKey, posKey, adjacentFaceIndicesForEdge, weldCoincidentVertices } from './meshTopology';
import { bevelLoopEdges } from './bevelLoop';
import { splitFaceBetween } from './cutTools';
import { cornerRadiusLoop } from './cornerRadius';
import { collectTopologicalEdgeLoop } from './edgeLoopTraversal';
import { clonePaintLayer } from './paintLayer';

// Toggle smooth (interpolated) normals for the selected mesh.
export function toggleSmoothShading(sm) {
  const sel = sm.selection;
  if (!sel.meshId) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  sm.pushUndo();
  mesh.smoothShading = !mesh.smoothShading;
  sm.rebuildThreeMesh(mesh.id);
}

// Split a mesh into disconnected face groups, each becoming its own mesh.
export function separateMesh(sm) {
  const sel = sm.selection;
  if (!sel.meshId) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  const edgeMap = new Map();
  for (let i = 0; i < mesh.faces.length; i++) {
    const f = mesh.faces[i];
    for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      if (!edgeMap.has(k)) edgeMap.set(k, []);
      edgeMap.get(k).push(i);
    }
  }

  const visited = new Set();
  const groups = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    if (visited.has(i)) continue;
    const group = [];
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      group.push(cur);
      const face = mesh.faces[cur];
      for (let j = 0; j < face.length; j++) {
        const k = edgeKey(face[j], face[(j + 1) % face.length]);
        const neighbors = edgeMap.get(k) || [];
        for (const n of neighbors) {
          if (!visited.has(n)) stack.push(n);
        }
      }
    }
    groups.push(group);
  }

  if (groups.length <= 1) return;
  sm.pushUndo();

  const copyAppearance = (target) => {
    target.visible = mesh.visible;
    target.locked = mesh.locked;
    target.color = mesh.color;
    target.smoothShading = mesh.smoothShading;
    target.clearCoatEnabled = mesh.clearCoatEnabled;
    target.clearCoatIntensity = mesh.clearCoatIntensity;
    target.material = mesh.material ? { ...mesh.material } : null;
    target.mapTexture = mesh.mapTexture?.clone() || null;
    if (target.mapTexture) target.mapTexture.needsUpdate = true;
    target.textureUrl = mesh.textureUrl || null;
    target.referenceUrl = mesh.referenceUrl || null;
    target.textureTransform = { ...mesh.textureTransform };
    target.uvMode = mesh.uvMode;
    target.reflectionEnabled = mesh.reflectionEnabled;
    target.reflectionIntensity = mesh.reflectionIntensity;
    target.reflectionRoughness = mesh.reflectionRoughness;
    target.roughness = mesh.roughness;
    target.metalness = mesh.metalness;
    target.opacity = mesh.opacity;
    target.emissive = mesh.emissive;
    target.tintHue = mesh.tintHue;
    target.tintAmount = mesh.tintAmount;
    target.chamEnabled = mesh.chamEnabled;
    target.chamPrimary = mesh.chamPrimary;
    target.chamSecondary = mesh.chamSecondary;
    target.chamIntensity = mesh.chamIntensity;
    target.textureMergeColor = mesh.textureMergeColor;
    target.paintLayer = clonePaintLayer(mesh.paintLayer);
  };
  const remapEdges = (edges, usedVids, vidMap) => (edges || [])
    .filter((edge) => usedVids.has(edge.v1) && usedVids.has(edge.v2))
    .map((edge) => ({ ...edge, v1: vidMap.get(edge.v1), v2: vidMap.get(edge.v2) }));

  for (let g = 1; g < groups.length; g++) {
    const groupFaces = groups[g];
    const newMesh = new EditableMesh(mesh.name + ' part');
    newMesh.position.copy(mesh.position);
    newMesh.rotation.copy(mesh.rotation);
    newMesh.scale.copy(mesh.scale);
    copyAppearance(newMesh);
    const usedVids = new Set();
    for (const fi of groupFaces) {
      for (const vid of mesh.faces[fi]) usedVids.add(vid);
    }
    const vidMap = new Map();
    for (const vid of usedVids) {
      const v = mesh.getVertex(vid);
      const nv = { id: newVid(), x: v.x, y: v.y, z: v.z };
      newMesh.vertices.push(nv);
      vidMap.set(vid, nv.id);
      if (mesh.vertexColors[vid] != null) newMesh.vertexColors[nv.id] = mesh.vertexColors[vid];
    }
    for (const fi of groupFaces) {
      const newFaceIndex = newMesh.faces.length;
      newMesh.faces.push(mesh.faces[fi].map(vid => vidMap.get(vid)));
      if (mesh.faceColors[fi] != null) newMesh.faceColors[newFaceIndex] = mesh.faceColors[fi];
    }
    newMesh.explicitEdges = remapEdges(mesh.explicitEdges, usedVids, vidMap);
    newMesh.hiddenEdges = remapEdges(mesh.hiddenEdges, usedVids, vidMap);
    newMesh.visibleEdges = remapEdges(mesh.visibleEdges, usedVids, vidMap);
    newMesh.paintWireEdges = mesh.paintWireEdges ? remapEdges(mesh.paintWireEdges, usedVids, vidMap) : null;
    sm.meshes.push(newMesh);
    sm.buildThreeMesh(newMesh);
  }

  const allSeparated = new Set();
  for (let g = 1; g < groups.length; g++) {
    for (const fi of groups[g]) allSeparated.add(fi);
  }
  const keptFaces = mesh.faces.map((face, index) => ({ face, index })).filter(({ index }) => !allSeparated.has(index));
  mesh.faces = keptFaces.map(({ face }) => face);
  mesh.faceColors = Object.fromEntries(keptFaces.flatMap(({ index }, newIndex) =>
    mesh.faceColors[index] != null ? [[newIndex, mesh.faceColors[index]]] : []
  ));
  const remainingVids = new Set();
  for (const face of mesh.faces) for (const vid of face) remainingVids.add(vid);
  mesh.vertices = mesh.vertices.filter(v => remainingVids.has(v.id));
  mesh.vertexColors = Object.fromEntries(Object.entries(mesh.vertexColors).filter(([id]) => remainingVids.has(Number(id))));
  const keepRemainingEdges = (edges) => (edges || []).filter((edge) => remainingVids.has(edge.v1) && remainingVids.has(edge.v2));
  mesh.explicitEdges = keepRemainingEdges(mesh.explicitEdges);
  mesh.hiddenEdges = keepRemainingEdges(mesh.hiddenEdges);
  mesh.visibleEdges = keepRemainingEdges(mesh.visibleEdges);
  mesh.paintWireEdges = mesh.paintWireEdges ? keepRemainingEdges(mesh.paintWireEdges) : null;
  mesh.primitiveType = null;
  mesh.segments = null;
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.updateStats();
}

// Create a face from selected vertices, in selection order.
export function createFaceFromVertices(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'vertex' || sel.indices.length < 3) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  sm.pushUndo();
  const vids = sel.indices.map(i => mesh.vertices[i].id);
  // Single n-gon face spanning all selected vertices — one segment, no
  // triangulation diagonals across it (toBufferGeometry fan-triangulates only
  // for rendering; the stored face is one polygon).
  const newFaceIndex = mesh.faces.length;
  mesh.faces.push(vids);
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.selectionMode = 'face';
  sm.cb.onSelectionModeChange?.('face');
  sm.setSelection({ meshId: mesh.id, type: 'face', indices: [newFaceIndex] });
  sm.updateStats();
}

// Merge all selected vertices into the last-selected one (the target).
export function targetMergeVertices(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'vertex') return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  const pair = sm.targetMergePair;
  const validPair = pair?.meshId === sel.meshId && pair.sourceId != null
    && pair.sourceId !== pair.targetId
    && mesh.vertices.some(v => v.id === pair.sourceId)
    && mesh.vertices.some(v => v.id === pair.targetId);
  if (!validPair && sel.indices.length < 2) return;
  const targetVid = validPair ? pair.targetId : mesh.vertices[sel.indices[sel.indices.length - 1]].id;
  const toMerge = validPair ? new Set([pair.sourceId]) : new Set(sel.indices.slice(0, -1).map(i => mesh.vertices[i].id));
  sm.pushUndo();
  // Keep every visible edge whose endpoints stay distinct, even if the face
  // that supplied it becomes degenerate and has to be removed.
  const oldEdges = mesh.getEdges().map(e => ({ ...e }));
  const remap = (id) => toMerge.has(id) ? targetVid : id;
  const key = edgeKey;
  const survivors = new Map();
  for (const edge of oldEdges) {
    const v1 = remap(edge.v1), v2 = remap(edge.v2);
    if (v1 !== v2) survivors.set(key(v1, v2), { v1, v2 });
  }
  mesh.faces = mesh.faces.map(face => {
    const mapped = face.map(remap);
    const outline = mapped.filter((id, i) => id !== mapped[(i + mapped.length - 1) % mapped.length]);
    return outline.length >= 3 && new Set(outline).size === outline.length ? outline : null;
  }).filter(Boolean);
  const faceEdges = new Set();
  for (const face of mesh.faces) for (let i = 0; i < face.length; i++) faceEdges.add(key(face[i], face[(i + 1) % face.length]));
  const unique = (edges) => [...new Map(edges.filter(e => e.v1 !== e.v2).map(e => [key(e.v1, e.v2), e])).values()];
  mesh.explicitEdges = unique([
    ...mesh.explicitEdges.map(e => ({ ...e, v1: remap(e.v1), v2: remap(e.v2) })),
    ...[...survivors.entries()].filter(([k]) => !faceEdges.has(k)).map(([, e]) => e),
  ]);
  mesh.visibleEdges = unique([
    ...mesh.visibleEdges.map(e => ({ ...e, v1: remap(e.v1), v2: remap(e.v2) })),
    ...survivors.values(),
  ]);
  mesh.hiddenEdges = mesh.hiddenEdges.map(e => ({ ...e, v1: remap(e.v1), v2: remap(e.v2) }))
    .filter(e => e.v1 !== e.v2 && !survivors.has(key(e.v1, e.v2)));
  mesh.vertices = mesh.vertices.filter(v => !toMerge.has(v.id));
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
  sm.updateStats();
}

// Connect selected vertices with new edges, in selection order.
export function connectVertices(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'vertex' || sel.indices.length < 2) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  sm.pushUndo();
  const vids = sel.indices.map(i => mesh.vertices[i].id);
  const hiddenKey = (a, b) => `${Math.min(a, b)},${Math.max(a, b)}`;
  for (let i = 0; i < vids.length - 1; i++) {
    const v1 = vids[i], v2 = vids[i + 1];
    if (v1 === v2) continue;
    const key = hiddenKey(v1, v2);
    const faceEdge = mesh.faces.some(face => face.some((id, j) =>
      (id === v1 && face[(j + 1) % face.length] === v2) ||
      (id === v2 && face[(j + 1) % face.length] === v1)
    ));
    const attached = faceEdge || splitFaceBetween(mesh, v1, v2);
    // Never create a display-only line across one or more existing faces.
    // Multi-face connections require intersection vertices and face splitting;
    // reject unsupported paths rather than leaving detached geometry behind.
    if (!attached && mesh.faces.length) continue;
    mesh.hiddenEdges = mesh.hiddenEdges.filter(h => hiddenKey(h.v1, h.v2) !== key);
    if (!mesh.visibleEdges.some(e => hiddenKey(e.v1, e.v2) === key)) {
      mesh.visibleEdges.push({ v1: Math.min(v1, v2), v2: Math.max(v1, v2) });
    }
    if (!attached && !mesh.explicitEdges.some(e => hiddenKey(e.v1, e.v2) === key)) {
      mesh.explicitEdges.push({ v1, v2 });
    }
  }
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
}

// Chain a list of {v1,v2} edges into ordered vertex loops (by shared endpoints).
function orderLoops(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push(e.v2);
    adj.get(e.v2).push(e.v1);
  }
  const visited = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop = [];
    let cur = start, prev = -1;
    while (cur !== -1 && !visited.has(cur)) {
      visited.add(cur);
      loop.push(cur);
      const nbrs = (adj.get(cur) || []).filter(v => v !== prev);
      const next = nbrs.find(v => !visited.has(v));
      prev = cur;
      cur = next !== undefined ? next : -1;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Split a list of edges (by vertex pair) at their midpoints, dividing adjacent
// triangles into two. Winding is preserved by inserting the midpoint into the
// original face's cyclic order.
function splitEdgesByPair(mesh, pairs) {
  for (const { v1, v2 } of pairs) {
    if (!mesh.getVertex(v1) || !mesh.getVertex(v2)) continue;
    const A = mesh.getVertex(v1), B = mesh.getVertex(v2);
    const mid = { id: newVid(), x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
    mesh.vertices.push(mid);
    const adj = adjacentFaceIndicesForEdge(mesh, v1, v2);
    for (const fi of adj) {
      const f = mesh.faces[fi];
      let pos = -1;
      for (let i = 0; i < f.length; i++) {
        if ((f[i] === v1 && f[(i + 1) % f.length] === v2) || (f[i] === v2 && f[(i + 1) % f.length] === v1)) { pos = i; break; }
      }
      if (pos < 0) continue;
      if (f.length > 3) {
        // Polygon face: insert the midpoint into the outline, keeping one face.
        mesh.faces[fi] = [...f.slice(0, pos + 1), mid.id, ...f.slice(pos + 1)];
        continue;
      }
      const a = f[pos], b = f[(pos + 1) % 3], t = f[(pos + 2) % 3];
      mesh.faces[fi] = [a, mid.id, t];
      mesh.faces.push([mid.id, b, t]);
    }
    mesh.explicitEdges = mesh.explicitEdges.flatMap(ex => {
      if (ex.v1 === v1 && ex.v2 === v2) return [{ v1: v1, v2: mid.id }, { v1: mid.id, v2: v2 }];
      if (ex.v1 === v2 && ex.v2 === v1) return [{ v1: v2, v2: mid.id }, { v1: mid.id, v2: v1 }];
      return [ex];
    });
  }
}

// Coplanar-quad opposite edge (the edge across a quad, sharing no vertices).
// The quad is rebuilt from its two triangles: `shared` is the diagonal, and the
// four real sides run shared[0]→ns1→shared[1]→ns2. The opposite side is two
// steps around that outline. (Picking "the vertex not on the edge" from each
// triangle produced a degenerate edge, so ring walks died on the first quad.)
// For `fi`, a triangle that is one half of a coplanar-triangle quad (the other
// half found via mesh.getCoplanarFaceGroup), return that group plus the quad's
// four corners in cyclic order: [diagonalA, nonSharedOfFi, diagonalB,
// nonSharedOfPartner]. Returns null when `fi` isn't paired with exactly one
// coplanar partner (i.e. it is not one triangle-half of a two-triangle quad).
// Shared by quadOppositePairs and the loop walk in collectLoopEdgeIndices below
// — both need the same "which quad is this triangle half of, and what are its
// four corners" answer.
function coplanarQuadCorners(mesh, fi) {
  const group = mesh.getCoplanarFaceGroup(fi);
  if (group.length !== 2) return null;
  const other = group.find(g => g !== fi);
  const f1 = mesh.faces[fi], f2 = mesh.faces[other];
  const shared = f1.filter(v => f2.includes(v));
  if (shared.length !== 2) return null;
  const ns1 = f1.find(v => !shared.includes(v));
  const ns2 = f2.find(v => !shared.includes(v));
  if (ns1 === undefined || ns2 === undefined) return null;
  return { group, corners: [shared[0], ns1, shared[1], ns2] };
}

function quadOppositePairs(mesh, e) {
  const res = [];
  const adj = adjacentFaceIndicesForEdge(mesh, e.v1, e.v2);
  const ek = edgeKey(e.v1, e.v2);
  for (const fi of adj) {
    const f = mesh.faces[fi];
    // A stored four-sided polygon IS the quad: its opposite side is two steps
    // around its outline.
    if (f.length === 4) {
      const idx = f.findIndex((v, i) => edgeKey(v, f[(i + 1) % 4]) === ek);
      if (idx >= 0) res.push({ v1: f[(idx + 2) % 4], v2: f[(idx + 3) % 4] });
      continue;
    }
    const quad = coplanarQuadCorners(mesh, fi);
    if (!quad) continue;
    const [c0, c1, c2, c3] = quad.corners;
    const sides = [
      { v1: c0, v2: c1 },
      { v1: c1, v2: c2 },
      { v1: c2, v2: c3 },
      { v1: c3, v2: c0 },
    ];
    const idx = sides.findIndex(s => edgeKey(s.v1, s.v2) === ek);
    if (idx < 0) continue;
    res.push(sides[(idx + 2) % 4]);
  }
  return res;
}

// Loop/ring walks need neighboring faces to actually share vertices. Primitives
// carry split (duplicated) corner vertices for flat shading, so weld them first
// and re-find the selected edges by position. Returns the welded edge list and
// the selected edges' new indices.
function weldForEdgeWalk(sm, mesh, sel) {
  let edges = mesh.getEdges();
  const keyOf = (edge) => [mesh.getVertex(edge.v1), mesh.getVertex(edge.v2)].map(posKey).sort().join('|');
  const selectedKeys = sel.indices.map((index) => edges[index]).filter(Boolean).map(keyOf);
  if (selectedKeys.length === 0) return { edges, selectedIndices: [] };
  if (weldCoincidentVertices(mesh)) {
    sm.rebuildThreeMesh(mesh.id);
    edges = mesh.getEdges();
  }
  const selectedIndices = selectedKeys.map((key) => edges.findIndex((edge) => keyOf(edge) === key)).filter((index) => index >= 0);
  return { edges, selectedIndices };
}

// === FACE TOOLS ===

// Detach: selected faces leave the object and become their own separate mesh.
export function detachFaces(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'face' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  sm.pushUndo();
  const selSet = new Set(sel.indices);
  const usedVids = new Set();
  for (const fi of sel.indices) for (const vid of mesh.faces[fi]) usedVids.add(vid);
  const newMesh = new EditableMesh(mesh.name + ' detached');
  newMesh.position.copy(mesh.position);
  newMesh.rotation.copy(mesh.rotation);
  newMesh.scale.copy(mesh.scale);
  newMesh.color = mesh.color;
  newMesh.smoothShading = mesh.smoothShading;
  const vidMap = new Map();
  for (const vid of usedVids) {
    const v = mesh.getVertex(vid);
    const nv = { id: newVid(), x: v.x, y: v.y, z: v.z };
    newMesh.vertices.push(nv);
    vidMap.set(vid, nv.id);
  }
  for (const fi of sel.indices) {
    newMesh.faces.push(mesh.faces[fi].map(vid => vidMap.get(vid)));
  }
  newMesh.invalidateCache();
  mesh.faces = mesh.faces.filter((_, i) => !selSet.has(i));
  const stillUsed = new Set();
  for (const f of mesh.faces) for (const vid of f) stillUsed.add(vid);
  mesh.vertices = mesh.vertices.filter(v => stillUsed.has(v.id));
  mesh.explicitEdges = mesh.explicitEdges.filter(e => stillUsed.has(e.v1) && stillUsed.has(e.v2));
  mesh.invalidateCache();
  sm.meshes.push(newMesh);
  sm.buildThreeMesh(newMesh);
  sm.rebuildThreeMesh(mesh.id);
  // Detaching creates a new object: switch to Object mode and select it.
  sm.selectionMode = 'object';
  sm.cb.onSelectionModeChange?.('object');
  sm.setSelection({ meshId: newMesh.id, type: 'object', indices: [] });
  sm.updateStats();
}

// Clone faces: copy selected faces into a new separate object, keep originals.
export function cloneFaces(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'face' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  sm.pushUndo();
  const usedVids = new Set();
  for (const fi of sel.indices) for (const vid of mesh.faces[fi]) usedVids.add(vid);
  const newMesh = new EditableMesh(mesh.name + ' copy');
  newMesh.position.copy(mesh.position);
  newMesh.rotation.copy(mesh.rotation);
  newMesh.scale.copy(mesh.scale);
  newMesh.color = mesh.color;
  newMesh.smoothShading = mesh.smoothShading;
  const vidMap = new Map();
  for (const vid of usedVids) {
    const v = mesh.getVertex(vid);
    const nv = { id: newVid(), x: v.x, y: v.y, z: v.z };
    newMesh.vertices.push(nv);
    vidMap.set(vid, nv.id);
  }
  for (const fi of sel.indices) newMesh.faces.push(mesh.faces[fi].map(vid => vidMap.get(vid)));
  newMesh.invalidateCache();
  sm.meshes.push(newMesh);
  sm.buildThreeMesh(newMesh);
  // The copy is a new object: switch to Object mode and select it. (Setting an
  // object selection while still in Face mode is rejected, which is why the
  // clone used to appear unselected and the mode never changed.)
  sm.selectionMode = 'object';
  sm.cb.onSelectionModeChange?.('object');
  sm.setSelection({ meshId: newMesh.id, type: 'object', indices: [] });
  sm.updateStats();
}

// === EDGE TOOLS ===

// Split: insert a midpoint on each selected edge and divide the adjacent triangles.
export function splitEdge(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  const edges = mesh.getEdges();
  const pairs = sel.indices.map(i => edges[i]).filter(Boolean).map(e => ({ v1: e.v1, v2: e.v2 }));
  if (pairs.length === 0) return;
  sm.pushUndo();
  splitEdgesByPair(mesh, pairs);
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
  sm.updateStats();
}

// Bevel selected edges into adjustable segmented strips.
// Corner handling: each selected edge bevels into a rounded strip and leaves an
// open edge at each endpoint. At a FREE endpoint (only one selected edge there)
// we cap it with a triangle. At a SHARED endpoint (two selected edges meet — a
// closed loop or a chain), the two bevel strips are joined by a single corner
// quad instead of two overlapping caps (which produced the inward "spikes" on
// closed loops like a cylinder rim).
export function bevelEdge(sm, options = {}) {
  if (!options.skipUndo) sm.pushUndo();
  // The Radius tool is a section bend (corner radius), not an edge bevel.
  if (options.cornerRadius) cornerRadiusLoop(sm, options);
  else bevelLoopEdges(sm, options);
}

// === LIVE BEVEL PREVIEW ===
// Snapshot once when the bevel panel opens, then re-run the bevel from that
// snapshot on every parameter change so dragging a slider updates the mesh
// instantly without pushing a new undo step per tick.
export function beginBevelPreview(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge') return false;
  sm._bevelSnapshot = { meshes: sm.meshes.map(m => m.clone()), selection: { ...sel, indices: [...sel.indices] } };
  return true;
}

export function updateBevelPreview(sm, options) {
  const snap = sm._bevelSnapshot;
  if (!snap) return;
  sm.restoreSnapshot(snap);
  // bevelEdge clears the selection when it finishes (and re-maps indices when it
  // welds). Restoring the mesh without also restoring the selection meant every
  // preview after the first one had nothing selected, so changing radius or
  // segments silently reverted the mesh and Apply committed the original.
  sm.selection = { ...snap.selection, indices: [...snap.selection.indices] };
  bevelEdge(sm, { ...options, skipUndo: true });
}

export function commitBevelPreview(sm) {
  if (!sm._bevelSnapshot) return;
  sm.undoStack.push(sm._bevelSnapshot);
  if (sm.undoStack.length > sm.maxUndo) sm.undoStack.shift();
  sm.redoStack = [];
  sm._bevelSnapshot = null;
}

export function cancelBevelPreview(sm) {
  if (!sm._bevelSnapshot) return;
  sm.restoreSnapshot(sm._bevelSnapshot);
  sm._bevelSnapshot = null;
}

// A set of edges forms a single closed loop iff every involved vertex has
// degree 2 (no open ends, no branches) and all edges are in one connected
// component. Used to make select-loop absolute: entire closed loop or fail.
function isClosedLoop(edgeList) {
  if (!edgeList || edgeList.length < 3) return false;
  const deg = new Map();
  const adj = new Map();
  for (const e of edgeList) {
    deg.set(e.v1, (deg.get(e.v1) || 0) + 1);
    deg.set(e.v2, (deg.get(e.v2) || 0) + 1);
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push(e.v2);
    adj.get(e.v2).push(e.v1);
  }
  for (const d of deg.values()) if (d !== 2) return false;
  const start = edgeList[0].v1;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const nb of adj.get(cur) || []) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
  }
  return seen.size === deg.size;
}

// Collect the full closed edge loop containing `startEdge`. Two strategies run
// independently and the one that yields a single closed cycle wins:
//   1. quad-side walk — for flat quad meshes (cube): from an edge, step to the
//      adjacent quad side at the shared vertex (the loop direction). The two
//      quads sharing the start edge seed the two walk directions.
//   2. parallel-continuation walk — for curved/faceted meshes (torus): at each
//      vertex follow the most forward-parallel edge.
// Returns edge indices, or [] if neither strategy closes a loop.
function collectLoopEdgeIndices(mesh, startEdge, { allowFacePerimeter = true } = {}) {
  const edges = mesh.getEdges();
  const ekey = edgeKey;
  const pairToIndex = new Map();
  edges.forEach((e, i) => pairToIndex.set(ekey(e.v1, e.v2), i));
  const startEK = ekey(startEdge.v1, startEdge.v2);
  const toIndices = (set) => [...set].map(k => pairToIndex.get(k)).filter(i => i !== undefined);
  const toEdges = (set) => [...set].map(k => { const [a, b] = k.split(',').map(Number); return { v1: a, v2: b }; });
  const otherVertex = (ek, vid) => { const [x, y] = ek.split(',').map(Number); return x === vid ? y : x; };

  // For edge (v1,v2), at endpoint `at`, return the next loop edge from each
  // adjacent coplanar quad (the quad side at `at` that isn't the edge itself),
  // tagged with the quad it came from so a walk can stay in one quad chain.
  const nextAt = (v1, v2, at) => {
    const adj = adjacentFaceIndicesForEdge(mesh, v1, v2);
    const res = [];
    for (const fi of adj) {
      const quad = coplanarQuadCorners(mesh, fi);
      if (!quad) continue;
      const [c0, c1, c2, c3] = quad.corners;
      // Quad boundary sides in cyclic order (excluding the diagonal c0-c2).
      const sides = [ekey(c0, c1), ekey(c1, c2), ekey(c2, c3), ekey(c3, c0)];
      const ek = ekey(v1, v2);
      const idx = sides.indexOf(ek);
      if (idx < 0) continue;
      const candA = sides[(idx + 1) % 4];
      const candB = sides[(idx + 3) % 4];
      res.push({
        ek: candA.split(',').map(Number).includes(at) ? candA : candB,
        gkey: [...quad.group].sort((a, b) => a - b).join('/'),
      });
    }
    return res;
  };

  // --- quad-side walk (flat quad meshes) ---
  // Both directions must follow the SAME quad chain, otherwise the two halves
  // belong to two different loops and the result is never a closed cycle (that
  // is exactly what broke Select loop on a cube). One attempt per adjacent
  // quad; the first attempt that closes wins.
  const startCands = nextAt(startEdge.v1, startEdge.v2, startEdge.v2);
  const quadAttempts = [];
  for (const seed of startCands) {
    const result = new Set([startEK]);
    const walkQuad = (fromV, curV) => {
      let prevV = fromV, cur = curV;
      for (let guard = 0; guard < edges.length + 4; guard++) {
        const inEK = ekey(prevV, cur);
        const cands = nextAt(prevV, cur, cur);
        const pick = cands.find(c => c.gkey === seed.gkey && c.ek !== inEK)
          || cands.find(c => c.ek !== inEK && !result.has(c.ek));
        if (!pick || pick.ek === startEK) return;
        result.add(pick.ek);
        const nv = otherVertex(pick.ek, cur);
        prevV = cur; cur = nv;
        if (cur === fromV) return;
      }
    };
    walkQuad(startEdge.v1, startEdge.v2);
    walkQuad(startEdge.v2, startEdge.v1);
    quadAttempts.push(result);
  }

  // Vertex → incident edge keys (shared by boundary and parallel walks).
  const vertEdges = new Map();
  edges.forEach(e => {
    const k = ekey(e.v1, e.v2);
    if (!vertEdges.has(e.v1)) vertEdges.set(e.v1, []);
    if (!vertEdges.has(e.v2)) vertEdges.set(e.v2, []);
    vertEdges.get(e.v1).push(k);
    vertEdges.get(e.v2).push(k);
  });

  // --- boundary walk (holes: edges with exactly one adjacent face) ---
  // A removed face leaves a boundary loop; follow boundary edges around the hole.
  // Each hole corner has exactly one other boundary edge, so the walk is unambiguous.
  const bndResult = new Set([startEK]);
  const isBoundary = (ek) => {
    const [x, y] = ek.split(',').map(Number);
    return adjacentFaceIndicesForEdge(mesh, Math.min(x, y), Math.max(x, y)).length === 1;
  };
  const walkBoundary = (fromV, curV) => {
    let prevV = fromV, cur = curV;
    for (let guard = 0; guard < edges.length + 4; guard++) {
      const inEK = ekey(prevV, cur);
      const incident = (vertEdges.get(cur) || []).filter(k => k !== inEK && isBoundary(k));
      if (incident.length === 0) return;
      const nextEK = incident[0];
      if (nextEK === startEK) return;
      bndResult.add(nextEK);
      const nv = otherVertex(nextEK, cur);
      prevV = cur; cur = nv;
      if (cur === fromV) return;
    }
  };
  walkBoundary(startEdge.v1, startEdge.v2);
  walkBoundary(startEdge.v2, startEdge.v1);

  // --- continuation walk (curved / faceted meshes, and corners) ---
  // The loop continues through the edge that shares NO face with the edge we
  // arrived on — the standard edge-loop rule. Direction alone is not enough: a
  // loop around a box or a cylinder rim has to turn a hard corner, and the old
  // "must stay nearly parallel" test bailed out at exactly those corners, so the
  // loop never closed and Select loop selected nothing.
  const parResult = new Set([startEK]);
  const pv = (id) => mesh.getVertex(id);
  const facesOfKey = (ek) => {
    const [x, y] = ek.split(',').map(Number);
    return adjacentFaceIndicesForEdge(mesh, x, y);
  };
  const walkParallel = (fromV, curV) => {
    let prevV = fromV, cur = curV;
    for (let guard = 0; guard < edges.length + 4; guard++) {
      const inEK = ekey(prevV, cur);
      const inFaces = new Set(facesOfKey(inEK));
      const incident = (vertEdges.get(cur) || []).filter(k => k !== inEK);
      if (incident.length === 0) return;
      // Preferred candidates: edges at this vertex that share no face with the
      // incoming edge (on clean quad topology there is exactly one).
      const nonShared = incident.filter(k => facesOfKey(k).every(f => !inFaces.has(f)));
      const pool = nonShared.length > 0 ? nonShared : incident;
      let best = null;
      if (pool.length === 1) {
        best = { k: pool[0], nv: otherVertex(pool[0], cur) };
      } else {
        const travel = new THREE.Vector3().subVectors(pv(cur), pv(prevV));
        if (travel.lengthSq() < 1e-12) return;
        travel.normalize();
        let bestCos = -2;
        for (const k of pool) {
          const nv = otherVertex(k, cur);
          const d = new THREE.Vector3().subVectors(pv(nv), pv(cur));
          if (d.lengthSq() < 1e-12) continue;
          d.normalize();
          const cos = d.dot(travel);
          if (cos > bestCos) { bestCos = cos; best = { k, nv }; }
        }
        // Keep following the best topological continuation even when a faceted
        // corner turns sharply. Rejecting reverse-facing candidates made valid
        // loops stop at bends and segment junctions after the first edge.
      }
      if (!best || best.k === startEK) return;
      parResult.add(best.k);
      prevV = cur; cur = best.nv;
      if (cur === fromV) return;
    }
  };
  walkParallel(startEdge.v1, startEdge.v2);
  walkParallel(startEdge.v2, startEdge.v1);

  // Return whichever strategy closed a loop. Boundary (holes) is preferred;
  // otherwise the larger closed loop between quad-side and parallel wins.
  const bndClosed = isClosedLoop(toEdges(bndResult));
  if (bndClosed) return toIndices(bndResult);
  let quadResult = null;
  for (const attempt of quadAttempts) {
    if (!isClosedLoop(toEdges(attempt))) continue;
    if (!quadResult || attempt.size > quadResult.size) quadResult = attempt;
  }
  const parClosed = isClosedLoop(toEdges(parResult));
  if (parClosed) return toIndices(parResult);
  // Walking around one quad selects that face's four-edge perimeter, not an
  // edge loop. Keep it only for callers that explicitly need a closed border
  // (Create Face From Border); Select Loop must never use this result.
  if (allowFacePerimeter && quadResult) return toIndices(quadResult);
  return [];
}

function applySelectionPattern(indices, options = {}) {
  const skip = Math.max(0, Math.floor(Number(options.skip) || 0));
  const step = skip + 1;
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0)) % step;
  return indices.filter((_, position) => position % step === offset);
}

// Select the complete topological edge loop containing each selected edge.
// A loop may be open or closed; poles, boundaries, and ambiguous junctions end it.
export function selectLoop(sm, options = {}) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  const { edges, selectedIndices } = weldForEdgeWalk(sm, mesh, sel);
  if (selectedIndices.length === 0) return;
  const loopIndices = Array.from(new Set(selectedIndices.flatMap((index) =>
    collectTopologicalEdgeLoop(mesh, edges, index)
  )));
  const patterned = applySelectionPattern(loopIndices, options);
  sm.setSelection({ meshId: sel.meshId, type: 'edge', indices: patterned });
}

// Create face by border: expand the selected edge(s) to their full closed loop(s)
// and fill each loop with an outward-facing fan-triangulated face. A single
// selected edge is enough — the loop is walked first, then filled.
export function createFaceFromBorder(sm) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  const edges = mesh.getEdges();
  const ekey = edgeKey;
  const loopEdgeKeys = new Set();
  for (const ei of sel.indices) {
    const e = edges[ei];
    if (!e) continue;
    for (const li of collectLoopEdgeIndices(mesh, e)) {
      const le = edges[li];
      if (le) loopEdgeKeys.add(ekey(le.v1, le.v2));
    }
  }
  const loopEdges = [...loopEdgeKeys].map(k => {
    const [a, b] = k.split(',').map(Number);
    return { v1: a, v2: b };
  });
  // Loop is ALWAYS a closed loop; otherwise fail (no face created).
  if (!isClosedLoop(loopEdges)) return;
  const loops = orderLoops(loopEdges).filter(l => l.length >= 3);
  if (loops.length === 0) return;
  sm.pushUndo();
  // Mesh centroid, used to orient each new cap's normal outward.
  let cx = 0, cy = 0, cz = 0;
  for (const v of mesh.vertices) { cx += v.x; cy += v.y; cz += v.z; }
  const cn = mesh.vertices.length || 1;
  const centroid = new THREE.Vector3(cx / cn, cy / cn, cz / cn);
  for (const loop of loops) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = mesh.getVertex(loop[i]), b = mesh.getVertex(loop[(i + 1) % loop.length]);
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    const nlen = Math.hypot(nx, ny, nz) || 1;
    nx /= nlen; ny /= nlen; nz /= nlen;
    let lx = 0, ly = 0, lz = 0;
    for (const vid of loop) { const v = mesh.getVertex(vid); lx += v.x; ly += v.y; lz += v.z; }
    lx /= loop.length; ly /= loop.length; lz /= loop.length;
    const outward = (lx - centroid.x) * nx + (ly - centroid.y) * ny + (lz - centroid.z) * nz;
    const ordered = outward >= 0 ? loop : [...loop].reverse();
    // Single n-gon face spanning the entire loop (one face), not a triangle fan.
    mesh.faces.push(ordered);
  }
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  const newFaceIndices = Array.from({ length: loops.length }, (_, index) => mesh.faces.length - loops.length + index);
  sm.selectionMode = 'face';
  sm.cb.onSelectionModeChange?.('face');
  sm.setSelection({ meshId: sel.meshId, type: 'face', indices: newFaceIndices });
  sm.updateStats();
}

// Select ring: walk the edge ring through coplanar quad opposite (parallel) edges.
export function selectRing(sm, options = {}) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  // Without welding, a ring walk stopped at the first face boundary (split
  // corner vertices meant no face "shared" the next edge) and selected only
  // the tapped quad's opposite side.
  const { edges, selectedIndices } = weldForEdgeWalk(sm, mesh, sel);
  // Expand every selected seed edge, not only the first one.
  const visited = new Set();
  const collected = [];
  const stack = selectedIndices.map(index => edges[index]).filter(Boolean);
  if (!stack.length) return;
  while (stack.length) {
    const e = stack.pop();
    const k = edgeKey(e.v1, e.v2);
    if (visited.has(k)) continue;
    visited.add(k);
    collected.push(e);
    for (const o of quadOppositePairs(mesh, e)) {
      if (!visited.has(edgeKey(o.v1, o.v2))) stack.push(o);
    }
  }
  const pairToIndex = new Map();
  edges.forEach((e, i) => pairToIndex.set(edgeKey(e.v1, e.v2), i));
  const indices = collected.map(e => pairToIndex.get(edgeKey(e.v1, e.v2))).filter(i => i !== undefined);
  sm.setSelection({ meshId: sel.meshId, type: 'edge', indices: applySelectionPattern(indices, options) });
}
