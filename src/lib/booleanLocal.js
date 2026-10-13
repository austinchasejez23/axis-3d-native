import * as THREE from 'three';
import { newVid } from './meshTopology';
import { compactContactFaces, stableFanStart, closedTopologyProblem } from './booleanTopology';
import { connectBooleanSpokes, snapCollinearSpokesToRim } from './booleanSpokeConnections';

// Boolean restricted to the faces that touch the other object.
//
// The solid solver alone splits EVERY face of both objects against the planes
// of the other one, so a small hole in a detailed part came back with thousands
// of extra triangles and broken edge lines all over the model. Here only faces
// that actually intersect the other object are cut. Every other face is kept as
// it was (same vertices, same edges) and is only sorted into keep / drop by an
// inside test against the whole other object. New vertices on the border
// between cut and untouched faces are threaded into the untouched neighbours so
// the surface stays sealed.
//
// Returns false (and leaves `work` untouched) when it cannot run safely — an
// object that is not a closed solid — so the caller can use the full solver.

const EPS = 1e-5;        // plane-side tolerance for splitting (world units)
const ON_EPS = 5e-5;     // a piece lying on the other object's surface
const TOL = 2e-5;        // weld / stitch distance (world units, same space as EPS)
const ON = 0, FRONT = 1, BACK = 2, SPANNING = 3;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Triangles and a small BVH for overlap and ray queries
// ---------------------------------------------------------------------------
function makeTri(a, b, c, face) {
  const n = V().subVectors(b, a).cross(V().subVectors(c, a));
  if (n.lengthSq() < 1e-24) return null;
  n.normalize();
  const min = a.clone().min(b).min(c), max = a.clone().max(b).max(c);
  return { a, b, c, n, w: n.dot(a), min, max, face };
}

function newellNormal(points) {
  const n = V();
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  }
  return n.lengthSq() > 1e-24 ? n.normalize() : null;
}

function buildBVH(tris) {
  const centers = tris.map((t) => V().addVectors(t.min, t.max).multiplyScalar(0.5));
  const build = (list) => {
    const min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity);
    for (const i of list) { min.min(tris[i].min); max.max(tris[i].max); }
    if (list.length <= 8) return { min, max, list };
    const size = V().subVectors(max, min);
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    list.sort((p, q) => centers[p][axis] - centers[q][axis]);
    const mid = list.length >> 1;
    return { min, max, left: build(list.slice(0, mid)), right: build(list.slice(mid)) };
  };
  return tris.length ? build(tris.map((_, i) => i)) : null;
}

const boxesOverlap = (aMin, aMax, bMin, bMax, pad = 0) =>
  aMin.x <= bMax.x + pad && bMin.x <= aMax.x + pad &&
  aMin.y <= bMax.y + pad && bMin.y <= aMax.y + pad &&
  aMin.z <= bMax.z + pad && bMin.z <= aMax.z + pad;

function queryBox(node, min, max, out) {
  if (!node || !boxesOverlap(node.min, node.max, min, max)) return;
  if (node.list) { out.push(...node.list); return; }
  queryBox(node.left, min, max, out);
  queryBox(node.right, min, max, out);
}

function rayHitsBox(o, inv, min, max) {
  let t0 = -Infinity, t1 = Infinity;
  for (const k of ['x', 'y', 'z']) {
    let a = (min[k] - o[k]) * inv[k], b = (max[k] - o[k]) * inv[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  return t1 >= Math.max(t0, 0) - 1e-9;
}

function rayTri(o, d, t) {
  const e1 = V().subVectors(t.b, t.a), e2 = V().subVectors(t.c, t.a);
  const p = V().crossVectors(d, e2);
  const det = e1.dot(p);
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  const s = V().subVectors(o, t.a);
  const u = s.dot(p) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const q = V().crossVectors(s, e1);
  const v = d.dot(q) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const dist = e2.dot(q) * inv;
  if (dist <= 1e-9) return null;
  return { graze: u < 1e-7 || v < 1e-7 || u + v > 1 - 1e-7 };
}

const RAY_DIRS = [V(0.5774, 0.5771, 0.5776), V(-0.3123, 0.8567, 0.4107), V(0.7071, -0.1234, -0.6963)].map((d) => d.normalize());

// Point inside a closed solid: ray parity, retried in another direction when a
// ray grazes an edge or a vertex.
function insideSolid(p, solid) {
  let votes = 0;
  for (const d of RAY_DIRS) {
    const inv = V(1 / d.x, 1 / d.y, 1 / d.z);
    let count = 0, graze = false;
    const visit = (node) => {
      if (!node || !rayHitsBox(p, inv, node.min, node.max)) return;
      if (node.list) {
        for (const i of node.list) {
          const hit = rayTri(p, d, solid.tris[i]);
          if (hit) { count++; if (hit.graze) graze = true; }
        }
        return;
      }
      visit(node.left); visit(node.right);
    };
    visit(solid.bvh);
    if (!graze) return count % 2 === 1;
    votes += count % 2;
  }
  return votes >= 2;
}

// ---------------------------------------------------------------------------
// Triangle / triangle contact (crossing, touching or coplanar overlap)
// ---------------------------------------------------------------------------
const side = (d) => (d > EPS ? 1 : d < -EPS ? -1 : 0);

function interval(pts, d, s, D) {
  const vals = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (s[i] === 0) vals.push(D.dot(pts[i]));
    if (s[i] * s[j] < 0) {
      const k = d[i] / (d[i] - d[j]);
      vals.push(D.dot(pts[i]) + (D.dot(pts[j]) - D.dot(pts[i])) * k);
    }
  }
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
}

function to2D(p, axis) {
  return axis === 'x' ? [p.y, p.z] : axis === 'y' ? [p.z, p.x] : [p.x, p.y];
}

function segmentsCross2D(p1, p2, q1, q2) {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  const tol = 1e-12;
  return ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol));
}

function inTri2D(p, a, b, c) {
  const cross = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const c1 = cross(a, b, p), c2 = cross(b, c, p), c3 = cross(c, a, p);
  return (c1 >= -1e-12 && c2 >= -1e-12 && c3 >= -1e-12) || (c1 <= 1e-12 && c2 <= 1e-12 && c3 <= 1e-12);
}

function coplanarOverlap(t1, t2) {
  const n = t1.n;
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const axis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
  const A = [t1.a, t1.b, t1.c].map((p) => to2D(p, axis)), B = [t2.a, t2.b, t2.c].map((p) => to2D(p, axis));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (segmentsCross2D(A[i], A[(i + 1) % 3], B[j], B[(j + 1) % 3])) return true;
  }
  return A.some((p) => inTri2D(p, ...B)) || B.some((p) => inTri2D(p, ...A));
}

function trisTouch(t1, t2) {
  if (!boxesOverlap(t1.min, t1.max, t2.min, t2.max, EPS)) return false;
  const P1 = [t1.a, t1.b, t1.c], P2 = [t2.a, t2.b, t2.c];
  const d1 = P1.map((p) => t2.n.dot(p) - t2.w), s1 = d1.map(side);
  if (s1.every((s) => s > 0) || s1.every((s) => s < 0)) return false;
  if (s1.every((s) => s === 0)) return coplanarOverlap(t1, t2);
  const d2 = P2.map((p) => t1.n.dot(p) - t1.w), s2 = d2.map(side);
  if (s2.every((s) => s > 0) || s2.every((s) => s < 0)) return false;
  const D = V().crossVectors(t1.n, t2.n);
  if (D.lengthSq() < 1e-20) return false;
  D.normalize();
  const i1 = interval(P1, d1, s1, D), i2 = interval(P2, d2, s2, D);
  return !!(i1 && i2 && i1[0] <= i2[1] + EPS && i2[0] <= i1[1] + EPS);
}

// ---------------------------------------------------------------------------
// Polygon helpers
// ---------------------------------------------------------------------------
function splitByPlane(points, n, w) {
  const types = points.map((p) => { const d = n.dot(p) - w; return d < -EPS ? BACK : d > EPS ? FRONT : ON; });
  const all = types.reduce((acc, t) => acc | t, 0);
  if (all !== SPANNING) return null; // all on one side or on the plane: nothing to split
  const f = [], b = [];
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const ti = types[i], tj = types[j], pi = points[i], pj = points[j];
    if (ti !== BACK) f.push(pi);
    if (ti !== FRONT) b.push(pi);
    if ((ti | tj) === SPANNING) {
      const t = (w - n.dot(pi)) / n.dot(V().subVectors(pj, pi));
      const cut = pi.clone().lerp(pj, t);
      f.push(cut); b.push(cut);
    }
  }
  return [f, b].filter((poly) => poly.length >= 3);
}

function fanTris(points) {
  const out = [];
  for (let t = 0; t < points.length - 2; t++) {
    const tri = makeTri(points[0], points[t + 1], points[t + 2], -1);
    if (tri) out.push(tri);
  }
  return out;
}

function polygonArea(points) {
  const acc = V();
  for (let t = 1; t < points.length - 1; t++) {
    acc.add(V().subVectors(points[t], points[0]).cross(V().subVectors(points[t + 1], points[0])));
  }
  return acc.length() / 2;
}

function centroid(points) {
  const c = V();
  for (const p of points) c.add(p);
  return c.divideScalar(points.length);
}

function isConvexPlanar(points, n) {
  if (points.length === 3) return true;
  const w = n.dot(points[0]);
  for (const p of points) if (Math.abs(n.dot(p) - w) > 1e-6) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    if (V().subVectors(b, a).cross(V().subVectors(c, b)).dot(n) < -1e-12) return false;
  }
  return true;
}

// Cut a convex planar polygon by the planes of the other object's triangles
// that actually cross it. A piece is only split by a triangle that touches
// that piece, which keeps the cuts local.
function cutPolygon(points, cutters) {
  let pieces = [points];
  for (const tri of cutters) {
    const next = [];
    for (const piece of pieces) {
      const touches = fanTris(piece).some((t) => trisTouch(t, tri));
      const parts = touches ? splitByPlane(piece, tri.n, tri.w) : null;
      if (parts) next.push(...parts); else next.push(piece);
    }
    pieces = next;
  }
  return pieces;
}

// Where a piece sits relative to the other solid: 'in', 'out', or lying on its
// surface facing the 'same' or the 'opp'osite way.
function classify(points, normal, other, at = null, insideTest = null) {
  const c = at || centroid(points);
  const pad = V(ON_EPS, ON_EPS, ON_EPS);
  const near = [];
  queryBox(other.bvh, V().subVectors(c, pad), V().addVectors(c, pad), near);
  for (const i of near) {
    const t = other.tris[i];
    const dot = t.n.dot(normal);
    if (Math.abs(dot) < 1 - 1e-6 || Math.abs(t.n.dot(c) - t.w) > ON_EPS) continue;
    const ax = Math.abs(t.n.x), ay = Math.abs(t.n.y), az = Math.abs(t.n.z);
    const axis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
    if (inTri2D(to2D(c, axis), to2D(t.a, axis), to2D(t.b, axis), to2D(t.c, axis))) return dot > 0 ? 'same' : 'opp';
  }
  if (!boxesOverlap(c, c, other.min, other.max, ON_EPS)) return 'out';
  return (insideTest || ((q) => insideSolid(q, other)))(c) ? 'in' : 'out';
}

// Closest point on a triangle to p.
function closestOnTri(p, t) {
  const ab = V().subVectors(t.b, t.a), ac = V().subVectors(t.c, t.a), ap = V().subVectors(p, t.a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return t.a.clone();
  const bp = V().subVectors(p, t.b), d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return t.b.clone();
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return t.a.clone().addScaledVector(ab, d1 / (d1 - d3));
  const cp = V().subVectors(p, t.c), d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return t.c.clone();
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return t.a.clone().addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return t.b.clone().addScaledVector(V().subVectors(t.c, t.b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return t.a.clone().addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom);
}

// Inside / outside decided ONLY by the faces the two objects actually meet on.
// Nothing elsewhere in the model is consulted, so damage or open edges in the
// rest of the object cannot affect the result.
function localInsideTest(S, faceIdxs) {
  const tris = [];
  for (const fi of faceIdxs) for (const ti of S.faceTris[fi]) tris.push(S.tris[ti]);
  if (!tris.length) return null;
  const sign = S.inverted ? -1 : 1;   // a model wound inward still reads correctly
  return (p) => {
    let best = null, bestD = Infinity;
    for (const t of tris) {
      const q = closestOnTri(p, t);
      const d = q.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = { t, q }; }
    }
    return V().subVectors(p, best.q).dot(best.t.n) * sign < 0;
  };
}

// Faces sharing an edge.
function faceNeighbours(mesh) {
  const edges = new Map();
  mesh.faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(fi);
    }
  });
  const nb = mesh.faces.map(() => new Set());
  for (const fs of edges.values()) for (const x of fs) for (const y of fs) if (x !== y) nb[x].add(y);
  return nb;
}

// A point inside the face, taken from its largest triangle.
function faceSample(S, fi) {
  let at = null, bestArea = -1;
  for (const ti of S.faceTris[fi]) {
    const t = S.tris[ti];
    const area = V().subVectors(t.b, t.a).cross(V().subVectors(t.c, t.a)).lengthSq();
    if (area > bestArea) { bestArea = area; at = V().add(t.a).add(t.b).add(t.c).divideScalar(3); }
  }
  return at;
}

// Faces are drawn as a triangle fan from the first corner, which only works
// for convex shapes. A piece that comes out concave is cut along a diagonal
// into convex parts. Splitting on a diagonal keeps every corner, so nothing
// comes apart where it meets its neighbours.
function splitConcave(points, normal, depth = 0) {
  if (points.length <= 3 || depth > 12 || isConvexPlanar(points, normal)) return [points];
  const n = points.length;
  const cross = (i) => {
    const a = points[(i - 1 + n) % n], b = points[i], c = points[(i + 1) % n];
    return V().subVectors(b, a).cross(V().subVectors(c, b)).dot(normal);
  };
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  const axis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
  const flat = points.map((p) => to2D(p, axis));
  const segCross = (p1, p2, q1, q2) => {
    const d = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
    const t = 1e-12;
    return ((d1 > t && d2 < -t) || (d1 < -t && d2 > t)) && ((d3 > t && d4 < -t) || (d3 < -t && d4 > t));
  };
  const inside = (pt) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = flat[i], b = flat[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  for (let i = 0; i < n; i++) {
    if (cross(i) >= -1e-12) continue;                   // only start at a reflex corner
    for (let k = 2; k < n - 1; k++) {
      const j = (i + k) % n;
      let blocked = false;
      for (let e = 0; e < n && !blocked; e++) {
        const e2 = (e + 1) % n;
        if (e === i || e2 === i || e === j || e2 === j) continue;
        if (segCross(flat[i], flat[j], flat[e], flat[e2])) blocked = true;
      }
      if (blocked) continue;
      if (!inside([(flat[i][0] + flat[j][0]) / 2, (flat[i][1] + flat[j][1]) / 2])) continue;
      const first = [], second = [];
      for (let t = 0; ; t++) { const q = (i + t) % n; first.push(points[q]); if (q === j) break; }
      for (let t = 0; ; t++) { const q = (j + t) % n; second.push(points[q]); if (q === i) break; }
      if (first.length < 3 || second.length < 3) continue;
      if (polygonArea(first) < 1e-14 || polygonArea(second) < 1e-14) continue;
      return [...splitConcave(first, normal, depth + 1), ...splitConcave(second, normal, depth + 1)];
    }
  }
  return [points];
}

// Which pieces survive. A = the kept object, B = the other operand.
function keepPiece(isA, where, operation) {
  if (operation === 'subtract') {
    if (isA) return where === 'out' || where === 'opp';
    return where === 'in';
  }
  if (operation === 'intersect') {
    if (isA) return where === 'in' || where === 'same';
    return where === 'in';
  }
  if (isA) return where === 'out' || where === 'same';
  return where === 'out';
}

// ---------------------------------------------------------------------------
// Solids
// ---------------------------------------------------------------------------
function solidOf(mesh, wm) {
  const pos = new Map();
  for (const v of mesh.vertices) pos.set(v.id, V(v.x, v.y, v.z).applyMatrix4(wm));
  const tris = [], faceTris = [];
  mesh.faces.forEach((face, fi) => {
    const list = [];
    const pts = face.map((id) => pos.get(id));
    if (pts.some((p) => !p)) { faceTris.push(list); return; }
    // Convex faces split as a fan; a face that is not convex (an L shape, say)
    // is triangulated properly so its triangles stay inside the face.
    const n = newellNormal(pts);
    let corners;
    if (face.length > 3 && n && !isConvexPlanar(pts, n)) {
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const axis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
      corners = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(...to2D(p, axis))), []);
    } else {
      corners = [];
      for (let t = 0; t < face.length - 2; t++) corners.push([0, t + 1, t + 2]);
    }
    for (const [i, j, k] of corners) {
      let tri = makeTri(pts[i], pts[j], pts[k], fi);
      if (tri && n && tri.n.dot(n) < 0) tri = makeTri(pts[i], pts[k], pts[j], fi);
      if (tri) { list.push(tris.length); tris.push(tri); }
    }
    faceTris.push(list);
  });
  const min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity);
  for (const t of tris) { min.min(t.min); max.max(t.max); }
  // Which way this object's faces are wound. A model whose faces point inward
  // is still valid; the result just has to follow the same convention.
  let volume = 0;
  for (const t of tris) volume += t.a.dot(V().crossVectors(t.b, t.c)) / 6;
  return { mesh, wm, pos, tris, faceTris, bvh: buildBVH(tris), min, max, inverted: volume < 0 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Why the restricted path declined, for the message the tool shows.
export let lastSkipReason = null;
const skip = (why) => { lastSkipReason = why; return false; };

export function localBoolean(manager, work, operand, operation) {
  lastSkipReason = null;
  if (operation !== 'subtract' && operation !== 'union' && operation !== 'intersect') return skip('operation not supported');
  const A = solidOf(work, manager.getWorldMatrix(work));
  const B = solidOf(operand, manager.getWorldMatrix(operand));
  // Mirrored transforms flip winding; leave those to the full solver.
  if (A.wm.determinant() <= 0 || B.wm.determinant() <= 0) return skip('an object is mirrored');
  if (!A.tris.length || !B.tris.length) return skip('an object has no faces');

  // 1. Which triangles touch, and which triangles of the other side cut them.
  const cutsA = new Map(), cutsB = new Map();
  const add = (map, key, value) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); };
  if (boxesOverlap(A.min, A.max, B.min, B.max, EPS)) {
    const pad = V(EPS, EPS, EPS);
    A.tris.forEach((ta, i) => {
      if (!boxesOverlap(ta.min, ta.max, B.min, B.max, EPS)) return;
      const near = [];
      queryBox(B.bvh, V().subVectors(ta.min, pad), V().addVectors(ta.max, pad), near);
      for (const j of near) if (trisTouch(ta, B.tris[j])) { add(cutsA, ta.face, j); add(cutsB, B.tris[j].face, i); }
    });
  }

  // 2. Sort every face: untouched faces are kept or dropped whole; touched
  //    faces are cut and each piece is kept or dropped.
  const pieceSets = [];
  // The part's inside/outside is decided only by the faces the cutter actually
  // meets, so nothing elsewhere in the model is looked at.
  // Nothing to work from unless the two surfaces actually meet. Rather than
  // judge the whole shape, the tool says so and leaves the model alone.
  if (!cutsA.size || !cutsB.size) return skip('the objects are not touching');
  const insideA = localInsideTest(A, [...cutsA.keys()]);
  const insideB = (p) => insideSolid(p, B);

  // --- the part --------------------------------------------------------
  // Faces the cutter meets get split. Faces it does not meet are left exactly
  // as they are; the only extra ones considered are those reached by walking
  // out from the cut faces and found to be enclosed by the cutter.
  const enclosedA = new Set();
  if (cutsA.size) {
    const nb = faceNeighbours(A.mesh);
    const seen = new Set(cutsA.keys());
    const stack = [...cutsA.keys()];
    while (stack.length) {
      for (const nf of nb[stack.pop()]) {
        if (seen.has(nf)) continue;
        seen.add(nf);
        const at = faceSample(A, nf);
        if (at && insideB(at)) { enclosedA.add(nf); stack.push(nf); }
      }
    }
  }
  const keepUntouchedA = operation !== 'intersect';
  for (let fi = 0; fi < A.mesh.faces.length; fi++) {
    const points = A.mesh.faces[fi].map((id) => A.pos.get(id));
    if (points.some((p) => !p) || !A.faceTris[fi].length) continue;
    if (!cutsA.has(fi)) {
      const inCutter = enclosedA.has(fi);
      if (inCutter !== keepUntouchedA) pieceSets.push({ isA: true, fi, whole: true });
      continue;
    }
    const normal = newellNormal(points) || A.tris[A.faceTris[fi][0]].n;
    const cutters = [...cutsA.get(fi)].map((j) => B.tris[j]);
    const polys = isConvexPlanar(points, normal) ? [points]
      : A.faceTris[fi].map((ti) => [A.tris[ti].a, A.tris[ti].b, A.tris[ti].c]);
    const kept = [];
    let dropped = false;
    for (const poly of polys) {
      for (const piece of cutPolygon(poly, cutters)) {
        if (polygonArea(piece) < 1e-12) continue;
        if (keepPiece(true, classify(piece, normal, B, null, insideB), operation)) kept.push(...splitConcave(piece, normal));
        else dropped = true;
      }
    }
    if (!dropped && polys.length === 1) pieceSets.push({ isA: true, fi, whole: true });
    else for (const piece of kept) pieceSets.push({ isA: true, fi, points: piece });
  }

  // --- the cutter ------------------------------------------------------
  // The cutter is small, and whether each of its pieces is inside the part is
  // judged against the faces it meets, not against the whole model.
  for (let fi = 0; fi < B.mesh.faces.length; fi++) {
    const points = B.mesh.faces[fi].map((id) => B.pos.get(id));
    if (points.some((p) => !p) || !B.faceTris[fi].length) continue;
    const normal = newellNormal(points) || B.tris[B.faceTris[fi][0]].n;
    if (!cutsB.has(fi)) {
      const at = faceSample(B, fi);
      if (at && insideA && keepPiece(false, classify(points, normal, A, at, insideA), operation)) pieceSets.push({ isA: false, fi, whole: true });
      continue;
    }
    const cutters = [...cutsB.get(fi)].map((j) => A.tris[j]);
    const polys = isConvexPlanar(points, normal) ? [points]
      : B.faceTris[fi].map((ti) => [B.tris[ti].a, B.tris[ti].b, B.tris[ti].c]);
    const kept = [];
    let dropped = false;
    for (const poly of polys) {
      for (const piece of cutPolygon(poly, cutters)) {
        if (polygonArea(piece) < 1e-12) continue;
        if (keepPiece(false, classify(piece, normal, A, null, insideA), operation)) kept.push(...splitConcave(piece, normal));
        else dropped = true;
      }
    }
    if (!dropped && polys.length === 1) pieceSets.push({ isA: false, fi, whole: true });
    else for (const piece of kept) pieceSets.push({ isA: false, fi, points: piece });
  }

  // Nothing touched and nothing of B kept: A is unchanged.
  const changed = pieceSets.some((p) => !p.isA || !p.whole) || pieceSets.filter((p) => p.isA).length !== work.faces.length;
  if (!changed) return true;

  // 3. Write the result into `work`. Positions are welded in world space so
  //    every tolerance is in the same units as the cuts.
  work.lockTriangulationDiagonals();
  const inv = A.wm.clone().invert();
  // Subtract turns the cutter's surface into the cavity wall, so it is reversed
  // — but only relative to how each object is actually wound.
  const flipB = (operation === 'subtract') !== (A.inverted !== B.inverted);
  const edgeKeyOf = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const vertices = work.vertices.map((v) => ({ ...v }));
  const world = new Map();
  for (const v of vertices) world.set(v.id, A.pos.get(v.id) || V(v.x, v.y, v.z).applyMatrix4(A.wm));
  const grid = new Map();
  const cellOf = (p) => [Math.floor(p.x / TOL), Math.floor(p.y / TOL), Math.floor(p.z / TOL)];
  const remember = (id) => {
    const [x, y, z] = cellOf(world.get(id));
    const key = `${x},${y},${z}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(id);
  };
  vertices.forEach((v) => remember(v.id));
  const usedIds = new Set(vertices.map((v) => v.id));
  const freshId = () => { let id = newVid(); while (usedIds.has(id)) id = newVid(); usedIds.add(id); return id; };
  const idAt = (p) => {
    const [cx, cy, cz] = cellOf(p);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const id of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) if (world.get(id).distanceTo(p) <= TOL) return id;
    }
    const id = freshId();
    const local = p.clone().applyMatrix4(inv);
    vertices.push({ id, x: local.x, y: local.y, z: local.z });
    world.set(id, p.clone());
    remember(id);
    return id;
  };
  const bIds = new Map();
  const bId = (id) => { if (!bIds.has(id)) bIds.set(id, idAt(B.pos.get(id))); return bIds.get(id); };

  // What each existing edge was before the operation: hidden (automatic or by
  // the user) and whether it lay between faces in one plane (a grid line).
  const edgeInfo = new Map();
  const collectInfo = (mesh, pos, mapId) => {
    const hidden = new Map();
    for (const h of mesh.hiddenEdges) hidden.set(edgeKeyOf(h.v1, h.v2), !!h.user);
    const adjacency = new Map();
    mesh.faces.forEach((f, fi) => {
      for (let i = 0; i < f.length; i++) {
        const key = edgeKeyOf(f[i], f[(i + 1) % f.length]);
        if (!adjacency.has(key)) adjacency.set(key, { a: f[i], b: f[(i + 1) % f.length], faces: [] });
        adjacency.get(key).faces.push(fi);
      }
    });
    const normal = new Map();
    const normalOf = (fi) => { if (!normal.has(fi)) normal.set(fi, newellNormal(mesh.faces[fi].map((id) => pos.get(id)).filter(Boolean))); return normal.get(fi); };
    const out = new Map();
    for (const [key, e] of adjacency) {
      const ns = e.faces.map(normalOf);
      const wasFlat = ns.length >= 2 && ns.every((n) => n && ns[0] && n.dot(ns[0]) > 0.99995);
      const info = { hidden: hidden.has(key), user: !!hidden.get(key), wasFlat, a: pos.get(e.a), b: pos.get(e.b) };
      // On a cutter's triangulated cap, edges radiating from its central
      // vertex are construction geometry. They should not survive the cut
      // as a visible/editable fan on the bottom of the resulting pocket.
      if (mapId && wasFlat && e.faces.length === 2 &&
          mesh.faces[e.faces[0]].length === 3 && mesh.faces[e.faces[1]].length === 3) {
        const capNormal = mesh.getFaceNormal(e.faces[0]);
        const center = mesh._isFanCenter(e.a, e.faces[0], capNormal) ? e.a
          : mesh._isFanCenter(e.b, e.faces[0], capNormal) ? e.b : null;
        if (center != null) info.cutterFanCenter = mapId(center);
      }
      out.set(key, info);
      if (mapId) { const ma = mapId(e.a), mb = mapId(e.b); if (ma != null && mb != null) edgeInfo.set(edgeKeyOf(ma, mb), info); }
      else edgeInfo.set(key, info);
    }
    return out;
  };
  const infoA = collectInfo(work, A.pos, null);
  const bLocked = operand.clone();
  bLocked.lockTriangulationDiagonals();

  const faces = [], colors = [], changedFaces = new Set();
  const originalColors = work.faceColors || {};
  const pushFace = (ids, color, isChanged) => {
    const clean = ids.filter((id, i) => id !== ids[(i + 1) % ids.length]);
    if (clean.length < 3 || new Set(clean).size !== clean.length) return;
    faces.push(clean); colors.push(color ?? null);
    if (isChanged) changedFaces.add(faces.length - 1);
  };
  for (const piece of pieceSets) {
    if (piece.isA && piece.whole) pushFace([...work.faces[piece.fi]], originalColors[piece.fi], false);
    else if (piece.isA) pushFace(piece.points.map(idAt), originalColors[piece.fi], true);
    else {
      const ids = piece.whole ? operand.faces[piece.fi].map(bId) : piece.points.map(idAt);
      if (flipB) ids.reverse();
      pushFace(ids, null, true);
    }
  }
  const infoB = collectInfo(bLocked, B.pos, (id) => bIds.get(id));

  // 4. Thread vertices that sit on another face's edge into that face, so
  //    neighbouring faces share every corner (no cracks). A point goes only to
  //    the nearest edge of a face, and only once.
  const parentOf = new Map();
  if (changedFaces.size) {
    const regionMin = V(Infinity, Infinity, Infinity), regionMax = V(-Infinity, -Infinity, -Infinity);
    for (const fi of changedFaces) for (const id of faces[fi]) { regionMin.min(world.get(id)); regionMax.max(world.get(id)); }
    const pad = V(TOL * 4, TOL * 4, TOL * 4);
    regionMin.sub(pad); regionMax.add(pad);
    const regionFaces = [];
    faces.forEach((f, fi) => {
      const mn = V(Infinity, Infinity, Infinity), mx = V(-Infinity, -Infinity, -Infinity);
      for (const id of f) { mn.min(world.get(id)); mx.max(world.get(id)); }
      if (boxesOverlap(mn, mx, regionMin, regionMax)) regionFaces.push(fi);
    });
    const candidates = new Set();
    for (const fi of regionFaces) for (const id of faces[fi]) candidates.add(id);
    const candList = [...candidates];
    const diag = Math.max(regionMax.distanceTo(regionMin), 1e-6);
    const cell = Math.max(diag / 24, TOL * 10);
    const cGrid = new Map();
    for (const id of candList) {
      const p = world.get(id);
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
      if (!cGrid.has(key)) cGrid.set(key, []);
      cGrid.get(key).push(id);
    }
    const near = (mn, mx) => {
      const x0 = Math.floor((Math.max(mn.x, regionMin.x) - TOL) / cell), x1 = Math.floor((Math.min(mx.x, regionMax.x) + TOL) / cell);
      const y0 = Math.floor((Math.max(mn.y, regionMin.y) - TOL) / cell), y1 = Math.floor((Math.min(mx.y, regionMax.y) + TOL) / cell);
      const z0 = Math.floor((Math.max(mn.z, regionMin.z) - TOL) / cell), z1 = Math.floor((Math.min(mx.z, regionMax.z) + TOL) / cell);
      if (x1 < x0 || y1 < y0 || z1 < z0) return [];
      // A long edge over a fine grid: walking the cells would cost more than
      // checking every candidate.
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > candList.length) return candList;
      const out = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const list = cGrid.get(`${x},${y},${z}`);
        if (list) out.push(...list);
      }
      return out;
    };
    for (const fi of regionFaces) {
      const f = faces[fi];
      const inFace = new Set(f);
      const best = new Map(); // id -> { edge, t, dist }
      for (let i = 0; i < f.length; i++) {
        const pa = world.get(f[i]), pb = world.get(f[(i + 1) % f.length]);
        const dir = V().subVectors(pb, pa);
        const len = dir.length();
        if (len <= TOL) continue;
        dir.divideScalar(len);
        for (const id of near(pa.clone().min(pb), pa.clone().max(pb))) {
          if (inFace.has(id)) continue;
          const off = V().subVectors(world.get(id), pa);
          const t = off.dot(dir);
          if (t <= 1e-9 || t >= len - 1e-9) continue;
          const dist = off.addScaledVector(dir, -t).length();
          if (dist > TOL) continue;
          const prev = best.get(id);
          if (!prev || dist < prev.dist) best.set(id, { edge: i, t, dist, pa, dir });
        }
      }
      if (!best.size) continue;
      // Put each inserted point exactly on the line it was threaded onto. Left
      // a hair off, it makes the face very slightly concave, which the fan
      // renderer turns into a blade sticking out of the surface.
      for (const [id, hit] of best) {
        const onLine = hit.pa.clone().addScaledVector(hit.dir, hit.t);
        world.set(id, onLine);
        const local = onLine.clone().applyMatrix4(inv);
        const v = vertices.find((x) => x.id === id);
        if (v) { v.x = local.x; v.y = local.y; v.z = local.z; }
      }
      const byEdge = new Map();
      for (const [id, hit] of best) { if (!byEdge.has(hit.edge)) byEdge.set(hit.edge, []); byEdge.get(hit.edge).push([hit.t, id]); }
      const out = [];
      for (let i = 0; i < f.length; i++) {
        out.push(f[i]);
        const extra = byEdge.get(i);
        if (!extra) continue;
        extra.sort((p, q) => p[0] - q[0]);
        const chain = [f[i], ...extra.map((x) => x[1]), f[(i + 1) % f.length]];
        const parent = edgeKeyOf(f[i], f[(i + 1) % f.length]);
        for (let k = 0; k < chain.length - 1; k++) {
          const sub = edgeKeyOf(chain[k], chain[k + 1]);
          if (!parentOf.has(sub)) parentOf.set(sub, parentOf.get(parent) || parent);
        }
        out.push(...extra.map((x) => x[1]));
      }
      faces[fi] = out;
      changedFaces.add(fi);
    }
  }

  // A point threaded onto two lines at once can end up a hair off one of them,
  // leaving a corner barely concave. Flatten any such corner onto the line
  // between its neighbours; no vertex is removed, so nothing comes apart.
  // Every polygon is checked, not only the cut ones: snapping a point moves it
  // for every face that shares it, including faces the cut never touched.
  for (let pass = 0; pass < 3; pass++) {
    let fixed = 0;
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      if (f.length < 4) continue;
      const pts = f.map((id) => world.get(id));
      if (pts.some((p) => !p)) continue;
      const n = newellNormal(pts);
      if (!n) continue;
      for (let i = 0; i < f.length; i++) {
        const a = pts[(i - 1 + f.length) % f.length], b = pts[i], c = pts[(i + 1) % f.length];
        if (V().subVectors(b, a).cross(V().subVectors(c, b)).dot(n) >= -1e-14) continue;
        const dir = V().subVectors(c, a);
        const len = dir.length();
        if (len < 1e-12) continue;
        dir.divideScalar(len);
        const off = V().subVectors(b, a);
        const t = Math.max(0, Math.min(len, off.dot(dir)));
        const onLine = a.clone().addScaledVector(dir, t);
        if (onLine.distanceTo(b) > TOL * 4) continue;      // a real corner, leave it
        world.set(f[i], onLine);
        const local = onLine.clone().applyMatrix4(inv);
        const v = vertices.find((x) => x.id === f[i]);
        if (v) { v.x = local.x; v.y = local.y; v.z = local.z; }
        fixed++;
      }
    }
    if (!fixed) break;
  }

  // The cutter's flat sides are built from triangle pairs, so a cut across one
  // drops a spare point on its diagonal. Merge coplanar neighbours back into
  // one face, then drop any point left sitting mid-edge on a straight line.
  {
    const normalOfFace = (f) => { const pts = f.map((id) => world.get(id)); return pts.some((p) => !p) ? null : newellNormal(pts); };
    for (let pass = 0; pass < 4; pass++) {
      const edgeUse = new Map();
      faces.forEach((f, fi) => {
        if (!changedFaces.has(fi)) return;
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          const k = a < b ? `${a},${b}` : `${b},${a}`;
          if (!edgeUse.has(k)) edgeUse.set(k, []);
          edgeUse.get(k).push(fi);
        }
      });
      const gone = new Set();
      let merged = 0;
      for (const list of edgeUse.values()) {
        if (list.length !== 2) continue;
        const [x, y] = list;
        if (gone.has(x) || gone.has(y) || x === y) continue;
        const fx = faces[x], fy = faces[y];
        const nx = normalOfFace(fx), ny = normalOfFace(fy);
        if (!nx || !ny || nx.dot(ny) < 0.99995) continue;
        // the one edge they share, as x walks it
        let ai = -1;
        for (let i = 0; i < fx.length; i++) {
          const a = fx[i], b = fx[(i + 1) % fx.length];
          const j = fy.indexOf(b);
          if (j >= 0 && fy[(j + 1) % fy.length] === a) { ai = i; break; }
        }
        if (ai < 0) continue;
        const a = fx[ai], b = fx[(ai + 1) % fx.length];
        const rotX = [...fx.slice(ai), ...fx.slice(0, ai)];           // [a, b, ...]
        const bj = fy.indexOf(b);
        const rotY = [...fy.slice(bj), ...fy.slice(0, bj)];           // [b, a, ...]
        const ring = [a, ...rotY.slice(2), b, ...rotX.slice(2)];
        if (new Set(ring).size !== ring.length || ring.length < 3) continue;
        const pts = ring.map((id) => world.get(id));
        if (pts.some((p) => !p)) continue;
        const n = newellNormal(pts);
        if (!n || !isConvexPlanar(pts, n)) continue;
        faces[x] = ring; gone.add(y); merged++;
      }
      if (gone.size) {
        const keptF = [], keptC = [], keptCh = new Set();
        faces.forEach((f, fi) => { if (gone.has(fi)) return;
          if (changedFaces.has(fi)) keptCh.add(keptF.length);
          keptF.push(f); keptC.push(colors[fi]); });
        faces.length = 0; faces.push(...keptF);
        colors.length = 0; colors.push(...keptC);
        changedFaces.clear(); for (const i of keptCh) changedFaces.add(i);
      }
      if (!merged) break;
    }
    // A point that is mid-edge on a straight line in every face using it is spare.
    const useOf = new Map();
    faces.forEach((f, fi) => { for (const id of f) { if (!useOf.has(id)) useOf.set(id, []); useOf.get(id).push(fi); } });
    const spare = new Set();
    for (const [id, list] of useOf) {
      if (!list.length) continue;
      let flat = true;
      for (const fi of list) {
        const f = faces[fi];
        if (f.length < 4) { flat = false; break; }
        const i = f.indexOf(id);
        const a = world.get(f[(i - 1 + f.length) % f.length]), b = world.get(id), c = world.get(f[(i + 1) % f.length]);
        if (!a || !b || !c) { flat = false; break; }
        const ab = V().subVectors(b, a), cb = V().subVectors(c, b);
        if (ab.clone().cross(cb).length() > Math.max(ab.length() * cb.length(), 1e-12) * 1e-6) { flat = false; break; }
      }
      if (flat) spare.add(id);
    }
    // Only drop a point when every face that uses it stays convex without it.
    // On a curved surface a point can look collinear and still be holding the
    // face's shape.
    const okToDrop = (id) => useOf.get(id).every((fi) => {
      const trimmed = faces[fi].filter((v) => v !== id);
      if (trimmed.length < 3) return false;
      const pts = trimmed.map((v) => world.get(v));
      if (pts.some((p) => !p)) return false;
      const n = newellNormal(pts);
      return !!n && isConvexPlanar(pts, n);
    });
    const drop = new Set([...spare].filter(okToDrop));
    if (drop.size) faces.forEach((f, fi) => {
      const trimmed = f.filter((id) => !drop.has(id));
      if (trimmed.length >= 3 && trimmed.length !== f.length) { faces[fi] = trimmed; changedFaces.add(fi); }
    });
  }

  // 5. Start every changed face on its strongest corner: the face normal is
  //    taken from the first three corners.
  for (const fi of changedFaces) {
    const f = faces[fi];
    const pts = f.map((id) => world.get(id));
    const n = newellNormal(pts);
    if (!n) continue;
    let bestS = 0, bestScore = -Infinity;
    for (let s = 0; s < f.length; s++) {
      const a = pts[s], b = pts[(s + 1) % f.length], c = pts[(s + 2) % f.length];
      const score = V().subVectors(b, a).cross(V().subVectors(c, b)).dot(n);
      if (score > bestScore) { bestScore = score; bestS = s; }
    }
    if (bestS) faces[fi] = [...f.slice(bestS), ...f.slice(0, bestS)];
  }

  // Drop zero-area and duplicate faces.
  const seen = new Set();
  const keepFaces = [], keepColors = [], keepChanged = new Set();
  faces.forEach((f, fi) => {
    if (polygonArea(f.map((id) => world.get(id))) < 1e-12) return;
    const key = [...f].sort((a, b) => a - b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    if (changedFaces.has(fi)) keepChanged.add(keepFaces.length);
    keepFaces.push(f); keepColors.push(colors[fi]);
  });
  if (!keepFaces.length) {
    work.faces = []; work.vertices = []; work.invalidateCache();
    return true;
  }

  // The result keeps the winding the object already used.
  let volume = 0;
  for (const f of keepFaces) {
    const a = world.get(f[0]);
    for (let i = 1; i < f.length - 1; i++) volume += a.dot(world.get(f[i]).clone().cross(world.get(f[i + 1]))) / 6;
  }
  if (Math.abs(volume) > 1e-10 && (volume < 0) !== A.inverted) keepFaces.forEach((f) => f.reverse());


  // 6. Edge lines around the cut. One rule for every edge of a changed face:
  //    an edge the user deleted stays hidden; a line that ran between faces in
  //    one plane before (a grid line) stays visible; anything else is shown
  //    only where the faces on either side meet at an angle.
  const oldLines = [];
  for (const fi of cutsA.keys()) {
    const f = work.faces[fi];
    for (let i = 0; i < f.length; i++) { const info = infoA.get(edgeKeyOf(f[i], f[(i + 1) % f.length])); if (info?.a && info?.b) oldLines.push(info); }
  }
  for (const fj of cutsB.keys()) {
    const f = bLocked.faces[fj];
    for (let i = 0; i < f.length; i++) { const info = infoB.get(edgeKeyOf(f[i], f[(i + 1) % f.length])); if (info?.a && info?.b) oldLines.push(info); }
  }
  const alongOldLine = (pa, pb) => {
    for (const line of oldLines) {
      const dir = V().subVectors(line.b, line.a);
      const len = dir.length();
      if (len < 1e-9) continue;
      dir.divideScalar(len);
      const onLine = (p) => { const off = V().subVectors(p, line.a); const t = off.dot(dir); return t >= -TOL && t <= len + TOL && off.addScaledVector(dir, -t).length() <= TOL; };
      if (onLine(pa) && onLine(pb)) return line;
    }
    return null;
  };
  // Merge only the actual Boolean contact fragments. Original visible base
  // and cutter edges are constraints, never removed by the cleanup.
  const bridgeEdges = compactContactFaces(keepFaces, keepColors, keepChanged, world, (key, a, b) => {
    const info = edgeInfo.get(key) ||
      (parentOf.has(key) ? edgeInfo.get(parentOf.get(key)) : null) ||
      alongOldLine(a, b);
    if (operation === 'subtract' && info?.cutterFanCenter != null) return false;
    return !!info && !info.hidden;
  }, idAt, (key) => {
    const info = edgeInfo.get(key) || (parentOf.has(key) ? edgeInfo.get(parentOf.get(key)) : null);
    return !!info?.hidden && !info.user;
  }, (centerId, outerId) => {
    const info = edgeInfo.get(edgeKeyOf(centerId, outerId));
    return operation === 'subtract' && info?.cutterFanCenter === centerId;
  });

  // A clipped base grid edge can end short of the true cutter rim despite
  // both endpoints belonging to one face. Do NOT collapse/move vertices:
  // split that face to connect its existing grid endpoint to the existing
  // wall-intersection vertex. This preserves the solid and cutter contour.
  const cutterEdges = new Set();
  let smallestCutterEdge = Infinity;
  for (const face of operand.faces) for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length], key = edgeKeyOf(a, b);
    if (cutterEdges.has(key)) continue;
    cutterEdges.add(key);
    const distance = B.pos.get(a)?.distanceTo(B.pos.get(b));
    if (distance > TOL * 2) smallestCutterEdge = Math.min(smallestCutterEdge, distance);
  }
  const contactPlanes = [...cutsA.keys()].map((fi) => {
    const points = work.faces[fi].map((id) => A.pos.get(id));
    const normal = newellNormal(points);
    return normal && { normal, constant: normal.dot(points[0]) };
  }).filter(Boolean);
  const baseLineInfo = new Set(infoA.values());
  // A grid edge can stop immediately outside the contacted face. Its
  // untouched neighboring segment will not appear in cutsA/oldLines, so
  // preserve original base-edge directions from the WHOLE input mesh.
  // Prepared coordinates avoid thousands of temporary THREE.Vector3 objects
  // when a model has many original grid subdivisions.
  const allOriginalBaseLines = [...baseLineInfo]
    .filter((line) => !line.hidden && line.a && line.b)
    .map(({ a, b }) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      return { ax: a.x, ay: a.y, az: a.z, dx, dy, dz,
        lenSq: dx * dx + dy * dy + dz * dz,
        minX: Math.min(a.x,b.x) - TOL * 3, maxX: Math.max(a.x,b.x) + TOL * 3,
        minY: Math.min(a.y,b.y) - TOL * 3, maxY: Math.max(a.y,b.y) + TOL * 3,
        minZ: Math.min(a.z,b.z) - TOL * 3, maxZ: Math.max(a.z,b.z) + TOL * 3 };
    }).filter((line) => line.lenSq > TOL * TOL);
  const onExistingBaseLine = (a, b) => {
    for (const line of allOriginalBaseLines) {
      if ((a.x < line.minX || a.x > line.maxX || b.x < line.minX || b.x > line.maxX) ||
          (a.y < line.minY || a.y > line.maxY || b.y < line.minY || b.y > line.maxY) ||
          (a.z < line.minZ || a.z > line.maxZ || b.z < line.minZ || b.z > line.maxZ)) continue;
      const onSegment = (p) => {
        const ox = p.x-line.ax, oy = p.y-line.ay, oz = p.z-line.az;
        const t = (ox*line.dx + oy*line.dy + oz*line.dz)/line.lenSq;
        if (t < -1e-5 || t > 1+1e-5) return false;
        const x=ox-t*line.dx, y=oy-t*line.dy, z=oz-t*line.dz;
        return x*x+y*y+z*z < TOL*TOL*9;
      };
      if (onSegment(a) && onSegment(b)) return true;
    }
    return false;
  };
  const spokeRepairArgs = {
    faces: keepFaces, colors: keepColors, changed: keepChanged,
    world, bridgeEdges, contactPlanes,
    cutterMinEdge: smallestCutterEdge,
    baseDiagonal: A.max.distanceTo(A.min),
    originalBaseLine: (a, b) => {
      const line = alongOldLine(a, b);
      if (line && baseLineInfo.has(line) && !line.hidden) return true;
      return onExistingBaseLine(a, b);
    },
    closestCutterDistance: (p) => {
      let best = Infinity;
      for (const tri of B.tris) {
        const distance = closestOnTri(p, tri).distanceTo(p);
        if (distance < best) best = distance;
        if (best < 1e-6) break;
      }
      return best;
    },
  };
  const connectedSpokes = connectBooleanSpokes(spokeRepairArgs);
  const snappedChains = snapCollinearSpokesToRim({
    ...spokeRepairArgs,
    protectedIds: new Set(work.hiddenEdges.filter((e) => e.user)
      .flatMap((e) => [e.v1, e.v2])),
  });
  if (globalThis.process?.env?.AXIS_BOOLEAN_DEBUG)
    console.info('BOOLEAN_CONNECTED_SPOKES', connectedSpokes, 'SNAPPED_CHAINS', snappedChains);

  // Weld near-coincident vertices that the tight TOL missed at cutter/base intersections.
  // Split points on the base and the cutter wall are computed independently and
  // can land a fraction of a segment apart. Merge only pairs that are both near
  // the cutter surface, and only if the result stays manifold.
  {
    const scale = Math.max(smallestCutterEdge, TOL * 10);
    const weldDist = scale * 0.15;
    const changedIds = new Set();
    for (const fi of keepChanged) for (const id of keepFaces[fi] || []) changedIds.add(id);
    const ids = [...changedIds].filter((id) => world.has(id));
    const cutterDist = new Map();
    const distToCutter = (id) => {
      if (cutterDist.has(id)) return cutterDist.get(id);
      const p = world.get(id);
      let best = Infinity;
      for (const tri of B.tris) {
        const d = closestOnTri(p, tri).distanceTo(p);
        if (d < best) best = d;
        if (best < 1e-6) break;
      }
      cutterDist.set(id, best);
      return best;
    };
    const nearRim = ids.filter((id) => distToCutter(id) < scale * 0.5);
    const parent = new Map(nearRim.map((id) => [id, id]));
    const find = (id) => {
      let x = id;
      while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
      return x;
    };
    for (let i = 0; i < nearRim.length; i++) {
      for (let j = i + 1; j < nearRim.length; j++) {
        const a = nearRim[i], b = nearRim[j];
        if (world.get(a).distanceTo(world.get(b)) > weldDist) continue;
        const ra = find(a), rb = find(b);
        if (ra === rb) continue;
        if (distToCutter(ra) <= distToCutter(rb)) parent.set(rb, ra);
        else parent.set(ra, rb);
      }
    }
    const remap = (id) => parent.has(id) ? find(id) : id;
    const trial = keepFaces.map((f) => {
      const mapped = f.map(remap);
      return mapped.filter((id, i) => id !== mapped[(i + 1) % mapped.length]);
    });
    const trialOk = trial.every((f) => {
      if (f.length < 3 || new Set(f).size !== f.length) return false;
      return polygonArea(f.map((id) => world.get(id))) > 1e-10;
    }) && !closedTopologyProblem({ vertices: [...new Set(trial.flat())].map((id) => ({ id })), faces: trial });
    if (trialOk) {
      for (let fi = 0; fi < keepFaces.length; fi++) keepFaces[fi] = trial[fi];
      const nextFaces = [], nextColors = [], nextChanged = new Set();
      keepFaces.forEach((f, fi) => {
        if (keepChanged.has(fi)) nextChanged.add(nextFaces.length);
        nextFaces.push(f);
        nextColors.push(keepColors[fi]);
      });
      keepFaces.splice(0, keepFaces.length, ...nextFaces);
      keepColors.splice(0, keepColors.length, ...nextColors);
      keepChanged.clear();
      for (const fi of nextChanged) keepChanged.add(fi);
    }
  }

  // A cut can leave a point sitting on the middle of a straight edge: the
  // cutter's own hidden triangulation diagonal crosses the contact plane at
  // the midpoint of a flat side, and the rebuilt contact patch keeps it.
  // Dropping it changes no outline, because in every face that uses it the
  // point lies on the line between its two neighbours. Only points whose
  // every face was touched by this cut are considered, so untouched
  // neighbouring faces keep every vertex they share.
  {
    const keepIds = new Set(work.hiddenEdges.filter((e) => e.user).flatMap((e) => [e.v1, e.v2]));
    for (let pass = 0; pass < 3; pass++) {
      const useOf = new Map();
      keepFaces.forEach((f, fi) => { for (const id of f) { if (!useOf.has(id)) useOf.set(id, []); useOf.get(id).push(fi); } });
      const drop = new Set();
      for (const [id, uses] of useOf) {
        if (keepIds.has(id) || !world.has(id)) continue;
        if (!uses.every((fi) => keepChanged.has(fi))) continue;
        const p = world.get(id);
        let onLine = true;
        for (const fi of uses) {
          const f = keepFaces[fi];
          if (f.length <= 3) { onLine = false; break; }
          const k = f.indexOf(id);
          const a = world.get(f[(k - 1 + f.length) % f.length]);
          const b = world.get(f[(k + 1) % f.length]);
          if (!a || !b) { onLine = false; break; }
          const dir = V().subVectors(b, a);
          const len = dir.length();
          if (len < 1e-12) { onLine = false; break; }
          dir.divideScalar(len);
          const off = V().subVectors(p, a);
          const t = off.dot(dir);
          if (t <= 1e-9 || t >= len - 1e-9) { onLine = false; break; }
          if (off.addScaledVector(dir, -t).length() > Math.max(1e-9, len * 1e-7)) { onLine = false; break; }
        }
        if (onLine) drop.add(id);
      }
      if (!drop.size) break;
      for (let fi = 0; fi < keepFaces.length; fi++) {
        const trimmed = keepFaces[fi].filter((id) => !drop.has(id));
        if (trimmed.length >= 3 && trimmed.length !== keepFaces[fi].length) keepFaces[fi] = trimmed;
      }
    }
  }

  // Keep the renderer's implicit triangulation from producing zero-area
  // triangles along stitched boundaries (while retaining every vertex).
  for (const fi of keepChanged) keepFaces[fi] = stableFanStart(keepFaces[fi], world);

  const edgeFaces = new Map();
  keepFaces.forEach((f, fi) => {
    if (!keepChanged.has(fi)) return;
    for (let i = 0; i < f.length; i++) {
      const key = edgeKeyOf(f[i], f[(i + 1) % f.length]);
      if (!edgeFaces.has(key)) edgeFaces.set(key, { v1: f[i], v2: f[(i + 1) % f.length], faces: [] });
    }
  });
  keepFaces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const entry = edgeFaces.get(edgeKeyOf(f[i], f[(i + 1) % f.length]));
      if (entry) entry.faces.push(fi);
    }
  });
  const normals = new Map();
  const normalOf = (fi) => { if (!normals.has(fi)) normals.set(fi, newellNormal(keepFaces[fi].map((id) => world.get(id)))); return normals.get(fi); };
  const hideKeys = new Set(), showKeys = new Set();
  for (const [key, e] of edgeFaces) {
    const info = edgeInfo.get(key) || (parentOf.has(key) ? edgeInfo.get(parentOf.get(key)) : null) || alongOldLine(world.get(e.v1), world.get(e.v2));
    let hide;
    if (info?.user) hide = true;
    // Preserve old triangulation seams as hidden, even where a cut promoted
    // an adjacent triangle to a polygon. Better: merge that pair above.
    else if (info?.hidden) hide = true;
    else if (bridgeEdges.has(key)) hide = false;
    // A polygon stores its REAL face boundary. Coplanarity only means the
    // neighbouring surfaces are flat, not that their shared edge is a fake
    // triangulation diagonal. Hiding this boundary made newly created
    // Boolean faces appear edgeless (particularly on bevels and edge cuts).
    else if (e.faces.some((fi) => keepFaces[fi].length > 3)) hide = false;
    else if (info && !info.hidden && info.wasFlat) hide = false;
    else {
      const ns = e.faces.map(normalOf);
      // Only two coplanar TRIANGLES may share an implicit triangulation seam.
      // Never suppress an exposed edge (one face), a real n-gon boundary, or
      // a corner where the two adjacent faces change direction.
      hide = ns.length === 2 && ns.every((n) => n && ns[0] && n.dot(ns[0]) > 0.99995);
    }
    (hide ? hideKeys : showKeys).add(key);
  }

  // 7. Commit.
  const used = new Set(keepFaces.flat());
  const faceEdges = new Set();
  const polygonEdges = new Set();
  for (const f of keepFaces) for (let i = 0; i < f.length; i++) {
    const key = edgeKeyOf(f[i], f[(i + 1) % f.length]);
    faceEdges.add(key);
    if (f.length > 3) polygonEdges.add(key);
  }
  const alive = (e) => used.has(e.v1) && used.has(e.v2);
  const keyOfEntry = (e) => edgeKeyOf(e.v1, e.v2);
  const carriedHidden = [], carriedVisible = [];
  for (const e of bLocked.hiddenEdges) if (bIds.has(e.v1) && bIds.has(e.v2)) carriedHidden.push({ v1: bIds.get(e.v1), v2: bIds.get(e.v2), locked: true });
  for (const e of bLocked.visibleEdges) if (bIds.has(e.v1) && bIds.has(e.v2)) carriedVisible.push({ v1: bIds.get(e.v1), v2: bIds.get(e.v2) });
  const hidden = [...work.hiddenEdges, ...carriedHidden]
    .filter((e) => alive(e) && faceEdges.has(keyOfEntry(e)) &&
      (e.user || (!showKeys.has(keyOfEntry(e)) && !polygonEdges.has(keyOfEntry(e)))));
  const hiddenSet = new Set(hidden.map(keyOfEntry));
  for (const key of hideKeys) {
    if (hiddenSet.has(key)) continue;
    const [v1, v2] = key.split(',').map(Number);
    hidden.push({ v1, v2, locked: true });
  }
  const visible = [...work.visibleEdges, ...carriedVisible].filter((e) => alive(e) && faceEdges.has(keyOfEntry(e)) && !hideKeys.has(keyOfEntry(e)));
  const visibleSet = new Set(visible.map(keyOfEntry));
  for (const key of showKeys) {
    if (visibleSet.has(key)) continue;
    const [v1, v2] = key.split(',').map(Number);
    visible.push({ v1, v2 });
  }
  work.vertices = vertices.filter((v) => used.has(v.id));
  work.faces = keepFaces;
  const faceColors = {};
  keepColors.forEach((c, i) => { if (c != null) faceColors[i] = c; });
  work.faceColors = faceColors;
  work.hiddenEdges = hidden;
  work.visibleEdges = visible;
  // A stored paint wireframe is tied to the pre-Boolean vertex IDs. If kept,
  // EditableMesh.toEdgesGeometry() uses that stale array INSTEAD of the new
  // mesh's edges, so the Boolean appears to create faces with no wireframe.
  // Retain the paint layer itself; only invalidate the obsolete edge cache.
  work.paintWireEdges = null;
  work._paintDense = false;
  work.explicitEdges = work.explicitEdges.filter((e) => faceEdges.has(keyOfEntry(e)));
  work.primitiveType = null;
  work.segments = null;
  work.invalidateCache();
  return true;
}