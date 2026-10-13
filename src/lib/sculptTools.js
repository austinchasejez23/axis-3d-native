import * as THREE from 'three';

// Smoothstep falloff: 1 at the brush center, 0 at the radius edge.
const falloff = (d, radius) => {
  const t = Math.max(0, 1 - d / radius);
  return t * t * (3 - 2 * t);
};

// Vertices (by local index) within `radius` (world units, tested in local space
// against a world-space center converted to local) of `localCenter`, each with
// a smoothstep weight 0..1.
function brushVertices(mesh, localCenter, radius) {
  const r2 = radius * radius;
  const out = [];
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const dx = v.x - localCenter.x, dy = v.y - localCenter.y, dz = v.z - localCenter.z;
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
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
}

// Smooth brush: one pass of Laplacian smoothing over the vertices within the
// brush radius — each moves toward the average of its face-neighbors, weighted
// by the falloff and intensity. Operates in the mesh's local space.
export function sculptSmooth(sm, mesh, localCenter, radius, intensity, axes = []) {
  const affected = brushVertices(mesh, localCenter, radius);
  if (affected.length === 0) return;
  const idToIndex = new Map();
  for (let i = 0; i < mesh.vertices.length; i++) idToIndex.set(mesh.vertices[i].id, i);
  const affectedSet = new Set(affected.map(a => a.idx));
  // Accumulate one-ring neighbor position sums for affected vertices only.
  const sums = new Map();
  for (const a of affected) sums.set(a.idx, { x: 0, y: 0, z: 0, n: 0 });
  for (const face of mesh.faces) {
    for (let j = 0; j < face.length; j++) {
      const ci = idToIndex.get(face[j]);
      if (ci === undefined || !affectedSet.has(ci)) continue;
      const acc = sums.get(ci);
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
    const w = a.w * intensity;
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
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
}

// Push / Pull brush: displace every vertex within the brush radius along the
// surface normal at the hit point. Pull (direction +1) inflates outward;
// Push (direction -1) depresses inward. Falloff weights the displacement so
// the brush leaves a smooth dome, not a flat plateau.
export function sculptDisplace(sm, mesh, localCenter, localNormal, radius, intensity, direction, axes = []) {
  let n = localNormal.clone().normalize();
  if (axes.length > 0) {
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    const worldDirection = n.clone().multiply(mesh.scale).applyQuaternion(q);
    for (const axis of ['x', 'y', 'z']) if (!axes.includes(axis)) worldDirection[axis] = 0;
    n = sm.worldToLocalDelta(mesh, worldDirection).normalize();
  }
  const affected = brushVertices(mesh, localCenter, radius);
  if (affected.length === 0) return;
  const step = radius * 0.3 * intensity * direction;
  for (const a of affected) {
    const v = mesh.vertices[a.idx];
    v.x += n.x * step * a.w;
    v.y += n.y * step * a.w;
    v.z += n.z * step * a.w;
  }
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
}