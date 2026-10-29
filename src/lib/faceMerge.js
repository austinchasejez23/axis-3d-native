// Shared helpers for tools that merge or rebuild faces (Dissolve, vertex Bevel).
//
// What the user sees as ONE face can be stored as several triangles joined by
// hidden triangulation diagonals. Everything here works on those visible faces
// ("groups"), so a tool never sees a cube side as two halves.
import * as THREE from 'three';
import { edgeKey } from './meshTopology';
import { isSimplePolygon } from './meshTopologyInvariants';

// Face indices grouped by the visible face they belong to.
//   groupOf[fi] -> group id (the root face index)
//   groups      -> Map(group id -> [face indices])
export function visualFaceGroups(mesh) {
  const visible = new Set(mesh.getEdges().map((e) => edgeKey(e.v1, e.v2)));
  const parent = mesh.faces.map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  for (const [key, entry] of mesh._ensureEdgeFaceMap()) {
    if (entry.faces.length !== 2 || visible.has(key)) continue;
    parent[find(entry.faces[0])] = find(entry.faces[1]);
  }
  const groupOf = mesh.faces.map((_, fi) => find(fi));
  const groups = new Map();
  groupOf.forEach((root, fi) => {
    const list = groups.get(root);
    if (list) list.push(fi); else groups.set(root, [fi]);
  });
  return { groupOf, groups };
}

// Outline of a set of faces merged into one polygon. Edges shared by two of the
// faces cancel; what is left must be a single simple loop. Returns
// { loop, internal } (internal = keys of the edges that disappear) or null when
// the set has a hole, a pinch, a non-manifold edge or inconsistent winding.
export function mergeLoop(mesh, members) {
  const info = new Map();
  for (const fi of members) {
    const f = mesh.faces[fi];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const key = edgeKey(a, b);
      const e = info.get(key);
      if (!e) info.set(key, { count: 1, a, b });
      else {
        e.count++;
        if (e.a === a) return null;
      }
    }
  }
  const next = new Map();
  const internal = [];
  let boundary = 0;
  for (const [key, e] of info) {
    if (e.count > 2) return null;
    if (e.count === 2) { internal.push(key); continue; }
    if (next.has(e.a)) return null;
    next.set(e.a, e.b);
    boundary++;
  }
  if (boundary < 3) return null;
  const start = next.keys().next().value;
  const loop = [start];
  let cur = next.get(start);
  while (cur !== start) {
    if (cur === undefined || loop.length > boundary) return null;
    loop.push(cur);
    cur = next.get(cur);
  }
  if (loop.length !== boundary) return null;
  return { loop, internal };
}

function loopNormal(mesh, ids) {
  const n = new THREE.Vector3();
  for (let i = 0; i < ids.length; i++) {
    const p = mesh.getVertex(ids[i]), q = mesh.getVertex(ids[(i + 1) % ids.length]);
    if (!p || !q) return null;
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  }
  return n.lengthSq() > 1e-18 ? n.normalize() : null;
}

// Is this outline a usable face? Flat outlines must not cross themselves; bent
// ones (a merged corner) are accepted as they are.
export function checkPolygon(mesh, loop) {
  if (loop.length < 3 || new Set(loop).size !== loop.length) return { ok: false, planar: false };
  const normal = loopNormal(mesh, loop);
  if (!normal) return { ok: false, planar: false };
  const o = mesh.getVertex(loop[0]);
  let scale = 1e-6;
  for (const id of loop) {
    const v = mesh.getVertex(id);
    scale = Math.max(scale, Math.hypot(v.x - o.x, v.y - o.y, v.z - o.z));
  }
  const planar = loop.every((id) => {
    const v = mesh.getVertex(id);
    return Math.abs((v.x - o.x) * normal.x + (v.y - o.y) * normal.y + (v.z - o.z) * normal.z) <= scale * 1e-4;
  });
  if (planar && !isSimplePolygon(mesh, loop, normal)) return { ok: false, planar };
  return { ok: true, planar };
}

// Render triangles of the faces being merged, when they still tile the merged
// outline exactly (no vertex of theirs disappears). Keeps a bent surface from
// changing shape when its triangles are re-joined.
export function preservedTriangles(mesh, members, loop) {
  const inLoop = new Set(loop);
  const out = [];
  for (const fi of members) {
    const f = mesh.faces[fi];
    const stored = mesh.faceRenderTriangles?.[fi];
    const list = stored?.length ? stored.map((t) => [...t]) : mesh.getFaceTriangleIndices(fi).map((t) => t.map((i) => f[i]));
    for (const tri of list) {
      if (tri.length !== 3 || tri.some((id) => !inLoop.has(id))) return null;
      out.push(tri);
    }
  }
  return out.length === loop.length - 2 ? out : null;
}

// Rebuild the face list: drop `removed` face indices, append `additions`
// ({ poly, color?, tris? }). Per-face colors and saved render triangles follow
// the faces that survive. Returns the indices of the added faces.
export function replaceFaces(mesh, removed, additions) {
  const faces = [], colors = {}, tris = {};
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (removed.has(fi)) continue;
    const ni = faces.length;
    faces.push(mesh.faces[fi]);
    if (mesh.faceColors?.[fi] != null) colors[ni] = mesh.faceColors[fi];
    const stored = mesh.faceRenderTriangles?.[fi];
    if (stored?.length) tris[ni] = stored;
  }
  const indices = [];
  for (const add of additions) {
    const ni = faces.length;
    indices.push(ni);
    faces.push(add.poly);
    if (add.color != null) colors[ni] = add.color;
    if (add.tris?.length) tris[ni] = add.tris;
  }
  mesh.faces = faces;
  mesh.faceColors = colors;
  mesh.faceRenderTriangles = tris;
  mesh.invalidateCache();
  return indices;
}

// The first fill color found among a set of faces.
export function firstColor(mesh, members) {
  for (const fi of members) if (mesh.faceColors?.[fi] != null) return mesh.faceColors[fi];
  return null;
}

// Is there already a face (outside `ignore`) made of exactly these vertices?
export function hasFaceWithSameCorners(mesh, loop, ignore = new Set()) {
  const key = [...loop].sort((a, b) => a - b).join(',');
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (ignore.has(fi) || mesh.faces[fi].length !== loop.length) continue;
    if ([...mesh.faces[fi]].sort((a, b) => a - b).join(',') === key) return true;
  }
  return false;
}
