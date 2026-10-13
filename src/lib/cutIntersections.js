import * as THREE from 'three';

// Work in mesh space: lines that only overlap in the camera view do not cross.
function intersects(a, b, c, d, allowStart, allowEnd) {
  const u = b.clone().sub(a), v = d.clone().sub(c), w = c.clone().sub(a);
  const aa = u.lengthSq(), bb = v.lengthSq();
  if (!aa || !bb) return false;
  const epsilon = Math.max(Math.sqrt(aa), Math.sqrt(bb)) * 1e-7;
  const margin = epsilon / Math.sqrt(aa);
  const n = u.clone().cross(v), nn = n.lengthSq();
  let s;
  if (nn <= aa * bb * 1e-12) {
    if (w.clone().cross(u).lengthSq() > epsilon * epsilon * aa) return false;
    const t0 = w.dot(u) / aa, t1 = t0 + v.dot(u) / aa;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    if (hi < lo - margin) return false;
    if (hi - lo > margin) return true; // Collinear retracing is an overlap.
    s = (lo + hi) / 2;
  } else {
    s = w.clone().cross(v).dot(n) / nn;
    const t = w.clone().cross(u).dot(n) / nn;
    if (s < -margin || s > 1 + margin || t < -epsilon / Math.sqrt(bb) || t > 1 + epsilon / Math.sqrt(bb)) return false;
    if (a.clone().addScaledVector(u, s).distanceToSquared(c.clone().addScaledVector(v, t)) > epsilon * epsilon) return false;
  }
  return !((allowStart && s <= margin) || (allowEnd && s >= 1 - margin));
}

export function drawCutIntersects(mesh, points) {
  if (points.length < 2) return false;
  const positions = points.map(p => mesh.getVertexVector(p.v1).lerp(mesh.getVertexVector(p.v2), p.t));
  const a = positions[positions.length - 2], b = positions[positions.length - 1];
  if (a.distanceToSquared(b) < 1e-20) return true;
  for (let i = 0; i < positions.length - 2; i++) {
    // A closed path may touch its own first point, but not cross or retrace it.
    const closesAtFirst = i === 0 && points[0] === points[points.length - 1];
    if (intersects(a, b, positions[i], positions[i + 1], i === positions.length - 3, closesAtFirst)) return true;
  }
  for (const edge of mesh.getEdges()) {
    const c = mesh.getVertexVector(edge.v1), d = mesh.getVertexVector(edge.v2);
    const line = new THREE.Line3(c, d), tolerance = c.distanceToSquared(d) * 1e-14;
    // Two distinct points on the same edge subdivide that boundary, not a crossing.
    if (line.closestPointToPoint(a, true, new THREE.Vector3()).distanceToSquared(a) <= tolerance
      && line.closestPointToPoint(b, true, new THREE.Vector3()).distanceToSquared(b) <= tolerance) continue;
    if (intersects(a, b, c, d, true, true)) return true;
  }
  return false;
}