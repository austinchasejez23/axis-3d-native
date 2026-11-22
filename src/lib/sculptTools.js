import * as THREE from 'three';

// Smoothstep falloff: 1 at the brush center, 0 at the radius edge.
const falloff = (d, radius) => {
  const t = Math.max(0, 1 - d / radius);
  return t * t * (3 - 2 * t);
};

// How far apart brush dabs are along a stroke, as a share of the brush radius.
// Dabs follow the distance the finger travels, not how often the screen
// reports it, so a stroke builds up the same on any phone and holding still
// adds nothing.
export const SCULPT_DAB_SPACING = 0.25;
// Push / Pull: depth of one dab at full intensity, as a share of the radius.
// One pass over a spot lays down about four dabs (0.3 of the radius at 100%).
const DISPLACE_PER_DAB = 0.075;
// Smooth: share of the way to the neighbors' average one dab moves a vertex
// at full intensity.
const SMOOTH_PER_DAB = 0.5;

// Vertices (by local index) within `radius` world units of `localCenter`, each
// with a smoothstep weight 0..1. Distances are measured at the object's scale,
// so the brush covers the same area on a scaled object as its size shows.
function brushVertices(mesh, localCenter, radius) {
  const r2 = radius * radius;
  const sx = mesh.scale?.x || 1, sy = mesh.scale?.y || 1, sz = mesh.scale?.z || 1;
  const out = [];
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const dx = (v.x - localCenter.x) * sx, dy = (v.y - localCenter.y) * sy, dz = (v.z - localCenter.z) * sz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= r2) out.push({ idx: i, w: falloff(Math.sqrt(d2), radius) });
  }
  return out;
}

// Grab brush: record the vertices caught in the brush at stroke start and their
// original local positions. They are translated together by the drag delta.
export function sculptGrabStart(sm, mesh, localCenter, radius) {
  const affected = brushVertices(mesh, localCenter, radius);
  return affected.map(a => {
    const v = mesh.vertices[a.idx];
    return { idx: a.idx, w: a.w, start: { x: v.x, y: v.y, z: v.z } };
  });
}

// Apply a grab drag: move every grabbed vertex from its start position by the
// world drag delta (converted to the mesh's local space), weighted by w*intensity.
export function sculptGrabMove(sm, mesh, grabbed, worldDelta, intensity, axes = []) {
  const constrainedWorld = worldDelta.clone();
  if (axes.length > 0) {
    for (const axis of ['x', 'y', 'z']) if (!axes.includes(axis)) constrainedWorld[axis] = 0;
  }
  const localDelta = sm.worldToLocalDelta(mesh, constrainedWorld);
  for (const g of grabbed) {
    const v = mesh.vertices[g.idx];
    const w = g.w * intensity;
    v.x = g.start.x + localDelta.x * w;
    v.y = g.start.y + localDelta.y * w;
    v.z = g.start.z + localDelta.z * w;
  }
  // Only positions changed: the mesh's edge and vertex lookups stay valid.
  sm.rebuildThreeMesh(mesh.id);
}

// Smooth brush: one pass of Laplacian smoothing over the vertices within the
// brush radius — each moves toward the average of its face-neighbors, weighted
// by the falloff and intensity. Operates in the mesh's local space.
// Where each vertex sits in the faces (face, corner), in face order. A stroke
// never changes the faces, so this is worked out once per stroke.
function faceCorners(mesh, cache) {
  if (cache?.corners && cache.corners.faces === mesh.faces && cache.corners.faceCount === mesh.faces.length &&
      cache.corners.vertexCount === mesh.vertices.length) return cache.corners;
  const idToIndex = new Map();
  for (let i = 0; i < mesh.vertices.length; i++) idToIndex.set(mesh.vertices[i].id, i);
  const lists = new Array(mesh.vertices.length);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    for (let j = 0; j < face.length; j++) {
      const ci = idToIndex.get(face[j]);
      if (ci === undefined) continue;
      (lists[ci] || (lists[ci] = [])).push(fi, j);
    }
  }
  const corners = { faces: mesh.faces, faceCount: mesh.faces.length, vertexCount: mesh.vertices.length, lists };
  if (cache) cache.corners = corners;
  return corners;
}

// `cache`: an object kept for the length of one stroke.
export function sculptSmooth(sm, mesh, localCenter, radius, intensity, axes = [], cache = null) {
  const affected = brushVertices(mesh, localCenter, radius);
  if (affected.length === 0) return;
  const { lists } = faceCorners(mesh, cache);
  // Accumulate one-ring neighbor position sums for affected vertices only,
  // adding the neighbors in the same order as a pass over every face would.
  const sums = new Map();
  for (const a of affected) sums.set(a.idx, { x: 0, y: 0, z: 0, n: 0 });
  for (const a of affected) {
    const list = lists[a.idx];
    if (!list) continue;
    const acc = sums.get(a.idx);
    for (let m = 0; m < list.length; m += 2) {
      const face = mesh.faces[list[m]];
      const j = list[m + 1];
      for (let k = 0; k < face.length; k++) {
        if (k === j) continue;
        const nv = mesh.getVertex(face[k]);
        if (!nv) continue;
        acc.x += nv.x; acc.y += nv.y; acc.z += nv.z; acc.n++;
      }
    }
  }
  for (const a of affected) {
    const acc = sums.get(a.idx);
    if (!acc || acc.n === 0) continue;
    const v = mesh.vertices[a.idx];
    const ax = acc.x / acc.n, ay = acc.y / acc.n, az = acc.z / acc.n;
    const w = a.w * intensity * SMOOTH_PER_DAB;
    let delta = new THREE.Vector3((ax - v.x) * w, (ay - v.y) * w, (az - v.z) * w);
    if (axes.length > 0) {
      const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
      const worldDelta = delta.clone().multiply(mesh.scale).applyQuaternion(q);
      for (const axis of ['x', 'y', 'z']) if (!axes.includes(axis)) worldDelta[axis] = 0;
      delta = sm.worldToLocalDelta(mesh, worldDelta);
    }
    v.x += delta.x;
    v.y += delta.y;
    v.z += delta.z;
  }
  // Only positions changed: the mesh's edge and vertex lookups stay valid.
  sm.rebuildThreeMesh(mesh.id);
}

// Push / Pull brush: displace every vertex within the brush radius along the
// line to the camera. Pull (direction +1) draws the surface toward the camera;
// Push (direction -1) presses it away. `towardCamera` is a world direction.
// Falloff weights the displacement so the brush leaves a smooth dome, not a
// flat plateau.
export function sculptDisplace(sm, mesh, localCenter, towardCamera, radius, intensity, direction, axes = []) {
  const dir = towardCamera.clone();
  if (axes.length > 0) {
    for (const axis of ['x', 'y', 'z']) if (!axes.includes(axis)) dir[axis] = 0;
  }
  if (dir.lengthSq() < 1e-12) return;
  dir.normalize();
  const affected = brushVertices(mesh, localCenter, radius);
  if (affected.length === 0) return;
  // One full-weight dab, in the object's own space.
  const step = sm.worldToLocalDelta(mesh, dir.multiplyScalar(radius * DISPLACE_PER_DAB * intensity * direction));
  for (const a of affected) {
    const v = mesh.vertices[a.idx];
    v.x += step.x * a.w;
    v.y += step.y * a.w;
    v.z += step.z * a.w;
  }
  // Only positions changed: the mesh's edge and vertex lookups stay valid.
  sm.rebuildThreeMesh(mesh.id);
}