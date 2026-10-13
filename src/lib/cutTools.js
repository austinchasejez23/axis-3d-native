import * as THREE from 'three';
import { newVid, edgeKey, adjacentFaceIndicesForEdge } from './meshTopology';
import { drawCutIntersects } from '@/lib/cutIntersections';

// Geometry helpers shared by the Cut loop and Draw cut tools.
//
// Both tools work the same way: a cut runs between two points that sit on two
// edges of the SAME face, so the face is split into two polygons along it —
// that's what "respecting the object's edges" means. Quads stored as two
// coplanar triangles are merged back into a single 4-gon first, so the cut
// crosses the quad instead of getting stuck on its hidden diagonal.

export function pointOnEdge(mesh, v1, v2, t) {
  const a = mesh.getVertex(v1), b = mesh.getVertex(v2);
  if (!a || !b) return null;
  return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

// Ordered boundary loop of a group of coplanar faces (winding preserved).
function boundaryLoop(mesh, group) {
  const count = new Map();
  for (const fi of group) {
    const f = mesh.faces[fi];
    for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const next = new Map();
  let n = 0;
  for (const fi of group) {
    const f = mesh.faces[fi];
    for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      if (count.get(edgeKey(a, b)) === 1) { next.set(a, b); n++; }
    }
  }
  if (next.size !== n || n < 3) return null;
  const start = next.keys().next().value;
  const loop = [start];
  let cur = next.get(start);
  while (cur !== undefined && cur !== start && loop.length <= n) { loop.push(cur); cur = next.get(cur); }
  if (cur !== start || loop.length !== n) return null;
  return loop;
}

// Replace a coplanar face group with one polygon face; returns its index.
function mergeGroup(mesh, group) {
  if (group.length < 2) return group[0];
  const loop = boundaryLoop(mesh, group);
  if (!loop) return null;
  mesh.faces[group[0]] = loop;
  const rest = new Set(group.slice(1));
  mesh.faces = mesh.faces.filter((_, i) => !rest.has(i));
  mesh.invalidateCache();
  return mesh.faces.indexOf(loop);
}

// Every 4-sided polygon (real n-gon face or a coplanar triangle pair) that uses
// the edge a-b, returned as ordered vertex loops.
export function quadLoopsForEdge(mesh, a, b) {
  const loops = [];
  const seen = new Set();
  for (const fi of adjacentFaceIndicesForEdge(mesh, a, b)) {
    let loop = null;
    if (mesh.faces[fi].length === 4) loop = mesh.faces[fi];
    else {
      const group = mesh.getCoplanarFaceGroup(fi);
      if (group.length >= 2) loop = boundaryLoop(mesh, group);
    }
    if (!loop || loop.length !== 4) continue;
    const key = [...loop].sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    loops.push([...loop]);
  }
  return loops;
}

function loopIndexOfEdge(loop, a, b) {
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    if ((p === a && q === b) || (p === b && q === a)) return i;
  }
  return -1;
}

// Make sure the 4-sided area described by `loop` exists as ONE polygon face.
function ensureQuadFace(mesh, loop) {
  const key = [...loop].sort((x, y) => x - y).join(',');
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (f.length === 4 && [...f].sort((x, y) => x - y).join(',') === key) return fi;
  }
  for (const fi of adjacentFaceIndicesForEdge(mesh, loop[0], loop[1])) {
    const group = mesh.getCoplanarFaceGroup(fi);
    if (group.length < 2) continue;
    const bl = boundaryLoop(mesh, group);
    if (!bl || [...bl].sort((x, y) => x - y).join(',') !== key) continue;
    return mergeGroup(mesh, group);
  }
  return null;
}

// Insert a vertex at parameter t along edge v1→v2, threading it into the
// outline of every face that uses the edge (no face is torn).
export function insertVertexOnEdge(mesh, v1, v2, t) {
  const p = pointOnEdge(mesh, v1, v2, t);
  if (!p) return null;
  const nv = { id: newVid(), x: p.x, y: p.y, z: p.z };
  mesh.vertices.push(nv);
  for (const fi of adjacentFaceIndicesForEdge(mesh, v1, v2)) {
    const f = mesh.faces[fi];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if ((a === v1 && b === v2) || (a === v2 && b === v1)) {
        mesh.faces[fi] = [...f.slice(0, i + 1), nv.id, ...f.slice(i + 1)];
        break;
      }
    }
  }
  mesh.explicitEdges = mesh.explicitEdges.flatMap((ex) => {
    if ((ex.v1 === v1 && ex.v2 === v2) || (ex.v1 === v2 && ex.v2 === v1)) {
      return [{ v1: ex.v1, v2: nv.id }, { v1: nv.id, v2: ex.v2 }];
    }
    return [ex];
  });
  mesh.invalidateCache();
  return nv.id;
}

// The face where a cut between the two vertices is a valid split (both on the
// outline, not neighbours).
function findSplittableFace(mesh, a, b) {
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    const i = f.indexOf(a), j = f.indexOf(b);
    if (i < 0 || j < 0) continue;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    if (hi - lo >= 2 && !(lo === 0 && hi === f.length - 1)) return fi;
  }
  return null;
}

export function splitFaceBetween(mesh, a, b) {
  const fi = findSplittableFace(mesh, a, b);
  if (fi == null) return false;
  const f = mesh.faces[fi];
  const i = f.indexOf(a), j = f.indexOf(b);
  const lo = Math.min(i, j), hi = Math.max(i, j);
  const p1 = f.slice(lo, hi + 1);
  const p2 = [...f.slice(hi), ...f.slice(0, lo + 1)];
  if (p1.length < 3 || p2.length < 3) return false;
  mesh.faces[fi] = p1;
  mesh.faces.push(p2);
  mesh.explicitEdges.push({ v1: a, v2: b });
  mesh.invalidateCache();
  return true;
}

// If the two edges belong to one coplanar quad stored as triangles, merge it so
// a cut can cross it.
function mergeCommonPolygon(mesh, e1, e2) {
  const adj1 = adjacentFaceIndicesForEdge(mesh, e1.v1, e1.v2);
  const adj2 = new Set(adjacentFaceIndicesForEdge(mesh, e2.v1, e2.v2));
  if (adj1.some((fi) => adj2.has(fi))) return true;
  for (const fi of adj1) {
    const group = mesh.getCoplanarFaceGroup(fi);
    if (group.length < 2) continue;
    if (!group.some((g) => adj2.has(g))) continue;
    return mergeGroup(mesh, group) != null;
  }
  return false;
}

// === CUT LOOP ===
// Walk the edge ring from the tapped edge: in each quad the cut continues on
// the opposite side, at the same position along it.
export function buildCutLoopPlan(mesh, a0, b0, t, mode = 'follow') {
  const segments = [];
  const quadSeen = new Set();
  const edgeSeen = new Set();
  const stack = [[a0, b0]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const k = edgeKey(a, b);
    if (edgeSeen.has(k)) continue;
    edgeSeen.add(k);
    for (const loop of quadLoopsForEdge(mesh, a, b)) {
      const qk = [...loop].sort((x, y) => x - y).join(',');
      if (quadSeen.has(qk)) continue;
      const i = loopIndexOfEdge(loop, a, b);
      if (i < 0) continue;
      quadSeen.add(qk);
      const p = loop[i], r = loop[(i + 2) % 4], s = loop[(i + 3) % 4];
      // Loop sides: p-q, q-r, r-s, s-p. The point is measured from `a`, so the
      // opposite side is entered from the vertex `a` is joined to.
      const next = p === a ? [s, r] : [r, s];
      segments.push({ loop, from: [a, b], to: next });
      stack.push(next);
    }
  }
  if (mode === 'straight') {
    // Intersect the traversed edge ring with a single plane perpendicular to
    // the starting edge, instead of reusing a fixed fraction on every edge.
    const a = mesh.getVertex(a0), b = mesh.getVertex(b0);
    const normal = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const origin = pointOnEdge(mesh, a0, b0, t);
    const fraction = (v1, v2) => {
      const p = mesh.getVertex(v1), q = mesh.getVertex(v2);
      const start = new THREE.Vector3(p.x, p.y, p.z);
      const delta = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z);
      const denom = normal.dot(delta);
      if (Math.abs(denom) < 1e-8) return t;
      return Math.max(0.001, Math.min(0.999, normal.dot(origin.clone().sub(start)) / denom));
    };
    for (const seg of segments) {
      seg.fromT = fraction(...seg.from);
      seg.toT = fraction(...seg.to);
    }
  }
  return { t, segments };
}

export function cutLoopPreviewPoints(mesh, plan) {
  const out = [];
  for (const seg of plan.segments) {
    const p1 = pointOnEdge(mesh, seg.from[0], seg.from[1], seg.fromT ?? plan.t);
    const p2 = pointOnEdge(mesh, seg.to[0], seg.to[1], seg.toT ?? plan.t);
    if (p1 && p2) out.push([p1, p2]);
  }
  return out;
}

export function applyCutLoopPlan(mesh, plan) {
  for (const seg of plan.segments) ensureQuadFace(mesh, seg.loop);
  const vidByKey = new Map();
  const vidFor = (a, b, fraction) => {
    const k = edgeKey(a, b);
    if (vidByKey.has(k)) return vidByKey.get(k);
    const id = insertVertexOnEdge(mesh, a, b, fraction);
    vidByKey.set(k, id);
    return id;
  };
  let cuts = 0;
  for (const seg of plan.segments) {
    const v1 = vidFor(seg.from[0], seg.from[1], seg.fromT ?? plan.t);
    const v2 = vidFor(seg.to[0], seg.to[1], seg.toT ?? plan.t);
    if (v1 == null || v2 == null) continue;
    if (splitFaceBetween(mesh, v1, v2)) cuts++;
  }
  mesh.invalidateCache();
  return cuts;
}

// === DRAW CUT ===
// Group points by original edge and split its remaining sub-edge in sorted order.
// Tap order still determines the connected cut path, independently of insertion.
export function applyDrawCut(mesh, points, closed = false) {
  const path = closed ? [...points, points[0]] : points;
  for (let i = 1; i < path.length; i++) {
    if (drawCutIntersects(mesh, path.slice(0, i + 1))) return 0;
  }
  for (let i = 0; i < path.length - 1; i++) mergeCommonPolygon(mesh, path[i], path[i + 1]);
  const groups = new Map(), vids = new Array(points.length);
  points.forEach((p, index) => {
    const key = edgeKey(p.v1, p.v2);
    if (!groups.has(key)) groups.set(key, { v1: p.v1, v2: p.v2, points: [] });
    const group = groups.get(key);
    group.points.push({ index, t: p.v1 === group.v1 ? p.t : 1 - p.t });
  });
  let inserted = 0;
  for (const group of groups.values()) {
    let start = group.v1, previousT = 0;
    for (const point of group.points.sort((a, b) => a.t - b.t)) {
      const id = insertVertexOnEdge(mesh, start, group.v2, (point.t - previousT) / (1 - previousT));
      if (id == null) continue;
      vids[point.index] = id;
      start = id;
      previousT = point.t;
      inserted++;
    }
  }
  let cuts = 0;
  for (let i = 0; i < (closed ? vids.length : vids.length - 1); i++) {
    const next = (i + 1) % vids.length;
    const a = vids[i], b = vids[next];
    if (a == null || b == null) continue;
    // Consecutive points on one boundary have already subdivided that edge.
    if (edgeKey(points[i].v1, points[i].v2) === edgeKey(points[next].v1, points[next].v2)) continue;
    if (splitFaceBetween(mesh, a, b)) cuts++;
    else mesh.explicitEdges.push({ v1: a, v2: b });
  }
  // Extra points can make the first three boundary vertices collinear. Rotate
  // only those outlines so their existing normal calculation stays well-defined.
  for (const face of mesh.faces) {
    for (let attempt = 0; attempt < face.length - 1; attempt++) {
      const a = mesh.getVertexVector(face[0]), b = mesh.getVertexVector(face[1]), c = mesh.getVertexVector(face[2]);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20) break;
      face.push(face.shift());
    }
  }
  mesh.invalidateCache();
  return cuts || inserted;
}