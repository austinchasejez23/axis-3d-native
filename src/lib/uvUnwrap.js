import * as THREE from 'three';

// UV unwrapping. A mesh is cut into islands along its seams (seams the user
// marked, plus automatic ones at edges sharper than the Cut angle when it is
// on), each island is flattened with a least-squares conformal map so the
// image keeps its shapes, and the islands are packed into the 0..1 square with
// the same texel size everywhere. A piece that would stretch the image more
// than STRETCH_LIMIT is split: first along its hard edges, where a cut hides
// best, otherwise between its stretched and squeezed parts.
// Result: mesh.uvUnwrap = { faceCount, faces: [[[u, v] per corner] per face], islands: [[face index]] }

const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
export const NO_CUT_ANGLE = 180;
// Cut angle starts off: the model is cut only where seams are marked (and
// where a piece could not lie flat without it).
export const DEFAULT_CUT_ANGLE = NO_CUT_ANGLE;
// An edge bending by exactly the cut angle is never cut, so a shape whose
// edges all bend by that much (a 12-sided torus at 60°) is not cut wherever
// rounding happened to tip it over.
const ANGLE_TOLERANCE = 0.5;
// Edges bending more than this are hard edges: the first place to split a
// piece that stretches too much.
const HARD_ANGLE = 60;
// Largest stretch (either way, relative to the piece's typical face) a piece
// may have before it is split.
const STRETCH_LIMIT = 1.5;
const MAX_SPLIT_DEPTH = 6;
// The usual share of its bounding box a net of joined pieces must keep
// filling (other shares are tried too; see computeUnwrap).
const MIN_NET_FILL = 0.6;
const round = (n) => Math.round(n * 100000) / 100000;

function bendDegrees(mesh, f1, f2) {
  const d = THREE.MathUtils.clamp(mesh.getFaceNormal(f1).dot(mesh.getFaceNormal(f2)), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(d));
}

function faceEdgeKeys(face) {
  const keys = [];
  for (let i = 0; i < face.length; i++) keys.push(edgeKey(face[i], face[(i + 1) % face.length]));
  return keys;
}

function buildEdgeFaces(mesh) {
  const map = new Map();
  mesh.faces.forEach((face, fi) => {
    for (const key of faceEdgeKeys(face)) {
      let list = map.get(key);
      if (!list) { list = []; map.set(key, list); }
      list.push(fi);
    }
  });
  return map;
}

// Seams the user marked, plus every edge bending more than the cut angle.
function seamSet(mesh, edgeFaces, angle) {
  const seams = new Set((mesh.uvSeams || []).map((e) => edgeKey(e.v1, e.v2)));
  if (angle >= NO_CUT_ANGLE) return seams;
  for (const [key, list] of edgeFaces) {
    if (list.length !== 2) continue;
    if (bendDegrees(mesh, list[0], list[1]) > angle + ANGLE_TOLERANCE) seams.add(key);
  }
  return seams;
}

function findIslands(mesh, edgeFaces, seams) {
  const parent = mesh.faces.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [key, list] of edgeFaces) {
    if (seams.has(key) || list.length !== 2) continue;
    const a = find(list[0]), b = find(list[1]);
    if (a !== b) parent[a] = b;
  }
  const groups = new Map();
  mesh.faces.forEach((_, fi) => {
    const root = find(fi);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(fi);
  });
  return [...groups.values()];
}

// The island as a cut surface: corners that meet across a seam are different
// points. Returns the point each face corner belongs to, plus its topology.
function cutSurface(mesh, faces, edgeFaces, seams) {
  const inIsland = new Set(faces);
  const cornerId = new Map(); // `${fi}:${corner}` -> id
  let count = 0;
  for (const fi of faces) for (let k = 0; k < mesh.faces[fi].length; k++) cornerId.set(`${fi}:${k}`, count++);
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const cornerOf = (fi, vid) => mesh.faces[fi].indexOf(vid);
  const edgeUse = new Map();
  for (const fi of faces) {
    const face = mesh.faces[fi];
    for (let k = 0; k < face.length; k++) {
      const a = face[k], b = face[(k + 1) % face.length];
      const key = edgeKey(a, b);
      edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
      if (seams.has(key)) continue;
      for (const other of edgeFaces.get(key) || []) {
        if (other === fi || !inIsland.has(other)) continue;
        union(cornerId.get(`${fi}:${k}`), cornerId.get(`${other}:${cornerOf(other, a)}`));
        union(cornerId.get(`${fi}:${(k + 1) % face.length}`), cornerId.get(`${other}:${cornerOf(other, b)}`));
      }
    }
  }
  const classIndex = new Map();
  const classVid = [];
  const corner = new Map();
  for (const fi of faces) {
    const face = mesh.faces[fi];
    for (let k = 0; k < face.length; k++) {
      const root = find(cornerId.get(`${fi}:${k}`));
      if (!classIndex.has(root)) { classIndex.set(root, classVid.length); classVid.push(face[k]); }
      corner.set(`${fi}:${k}`, classIndex.get(root));
    }
  }
  // Euler characteristic of the cut surface (1 for a disk), and its boundary.
  const boundary = [];
  // Each cut-surface edge is used by one or two faces; used-once edges are boundary.
  const useCount = new Map();
  for (const fi of faces) {
    const face = mesh.faces[fi];
    for (let k = 0; k < face.length; k++) {
      const a = corner.get(`${fi}:${k}`), b = corner.get(`${fi}:${(k + 1) % face.length}`);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      useCount.set(key, (useCount.get(key) || 0) + 1);
    }
  }
  for (const [key, n] of useCount) if (n === 1) boundary.push(key.split(',').map(Number));
  return { corner, classVid, chi: classVid.length - useCount.size + faces.length, boundary };
}

function loopsOfBoundary(boundary) {
  const parent = new Map();
  const find = (x) => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [a, b] of boundary) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }
  const loopOf = new Map();
  for (const [a, b] of boundary) { loopOf.set(a, find(a)); loopOf.set(b, find(b)); }
  return loopOf;
}

// Cuts an island that is not yet a disk: a closed shape gets a slit from one
// pole to the other, a tube gets a slit joining its two rims.
function cutOnce(mesh, faces, surface, seams) {
  const adj = new Map();
  const addEdge = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, w]); adj.get(b).push([a, w]);
  };
  const seen = new Set();
  for (const fi of faces) {
    const face = mesh.faces[fi];
    for (let k = 0; k < face.length; k++) {
      const a = face[k], b = face[(k + 1) % face.length];
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      addEdge(a, b, mesh.getVertexVector(a).distanceTo(mesh.getVertexVector(b)));
    }
  }
  const loopOfClass = loopsOfBoundary(surface.boundary);
  const loopOfVid = new Map();
  for (const [cls, loop] of loopOfClass) loopOfVid.set(surface.classVid[cls], loop);
  const verts = [...adj.keys()];
  let start;
  if (loopOfVid.size) start = [...loopOfVid.keys()][0];
  else start = verts.reduce((best, vid) => (mesh.getVertex(vid).y < mesh.getVertex(best).y ? vid : best), verts[0]);
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const queue = [[0, start]];
  while (queue.length) {
    queue.sort((p, q) => p[0] - q[0]);
    const [d, u] = queue.shift();
    if (d > dist.get(u)) continue;
    for (const [v, w] of adj.get(u) || []) {
      const nd = d + w;
      if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, u); queue.push([nd, v]); }
    }
  }
  let target = null;
  if (loopOfVid.size) {
    const startLoop = loopOfVid.get(start);
    let best = Infinity;
    for (const [vid, loop] of loopOfVid) {
      if (loop === startLoop || !dist.has(vid)) continue;
      if (dist.get(vid) < best) { best = dist.get(vid); target = vid; }
    }
    if (target == null) return false;
  } else {
    let best = -1;
    for (const [vid, d] of dist) if (d > best) { best = d; target = vid; }
  }
  if (target == null || target === start) return false;
  let cursor = target;
  let marked = 0;
  while (prev.has(cursor)) {
    seams.add(edgeKey(cursor, prev.get(cursor)));
    cursor = prev.get(cursor);
    marked++;
  }
  return marked > 0;
}

// Flatten one island. Returns uv per cut-surface point, in scene units.
function flatten(mesh, faces, surface) {
  const n = surface.classVid.length;
  const pos = surface.classVid.map((vid) => mesh.getVertexVector(vid));
  // Plane through the island along its average normal: the start for the solve
  // and the fallback when the solve fails.
  const normal = new THREE.Vector3();
  for (const fi of faces) normal.add(mesh.getFaceNormal(fi).clone().multiplyScalar(mesh.getFaceArea ? mesh.getFaceArea(fi) : 1));
  if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
  normal.normalize();
  const helper = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const ax = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const ay = new THREE.Vector3().crossVectors(normal, ax).normalize();
  const planar = pos.map((p) => [p.dot(ax), p.dot(ay)]);

  const tris = [];
  for (const fi of faces) {
    for (const tri of mesh.getFaceTriangleIndices(fi)) tris.push(tri.map((c) => surface.corner.get(`${fi}:${c}`)));
  }
  let area3d = 0;
  for (const [a, b, c] of tris) area3d += new THREE.Vector3().subVectors(pos[b], pos[a]).cross(new THREE.Vector3().subVectors(pos[c], pos[a])).length() / 2;

  let result = null;
  if (n >= 3 && surface.chi === 1 && tris.length > 1) result = solveConformal(pos, tris, planar);
  if (!result) result = planar.map((p) => [p[0], p[1]]);

  // Keep the surface facing up (not mirrored) and at its real size.
  let signed = 0, unsigned = 0;
  for (const [a, b, c] of tris) {
    const s = ((result[b][0] - result[a][0]) * (result[c][1] - result[a][1]) - (result[c][0] - result[a][0]) * (result[b][1] - result[a][1])) / 2;
    signed += s; unsigned += Math.abs(s);
  }
  if (signed < 0) for (const p of result) p[0] = -p[0];
  const scale = unsigned > 1e-12 && area3d > 1e-12 ? Math.sqrt(area3d / unsigned) : 1;
  for (const p of result) { p[0] *= scale; p[1] *= scale; }
  return result;
}

// Cut an island open until it is a disk, then flatten it.
function flattenIsland(mesh, faces, edgeFaces, seams) {
  let surface = cutSurface(mesh, faces, edgeFaces, seams);
  for (let i = 0; i < 3 && surface.chi !== 1; i++) {
    if (!cutOnce(mesh, faces, surface, seams)) break;
    surface = cutSurface(mesh, faces, edgeFaces, seams);
  }
  return { faces, surface, points: flatten(mesh, faces, surface) };
}

const signedArea2 = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

// How unevenly a flattened piece scales the image: each face's flat area over
// its real area, as a log, relative to the piece's typical (area-weighted
// median) face. A face that came out flipped counts as the worst stretch.
// Faces too small to see are left out of the worst case.
function stretchOf(mesh, island) {
  const items = [];
  let total = 0;
  for (const fi of island.faces) {
    const face = mesh.faces[fi];
    let real = 0, flat = 0;
    for (const tri of mesh.getFaceTriangleIndices(fi)) {
      const p = tri.map((c) => mesh.getVertexVector(face[c]));
      real += new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).length() / 2;
      const q = tri.map((c) => island.points[island.surface.corner.get(`${fi}:${c}`)]);
      flat += signedArea2(q[0], q[1], q[2]);
    }
    total += real;
    items.push({ fi, real, flat });
  }
  const logOf = new Map();
  const visible = [];
  for (const it of items) {
    if (it.real <= total * 1e-6) { logOf.set(it.fi, 0); continue; }
    const flipped = it.flat <= 0;
    const value = flipped ? null : Math.log(it.flat / it.real);
    logOf.set(it.fi, value);
    visible.push({ ...it, value, flipped });
  }
  const sorted = visible.filter((it) => !it.flipped).sort((a, b) => a.value - b.value);
  let median = 0;
  const half = sorted.reduce((sum, it) => sum + it.real, 0) / 2;
  let run = 0;
  for (const it of sorted) { run += it.real; if (run >= half) { median = it.value; break; } }
  let worst = 0;
  let maxValue = -Infinity;
  for (const it of visible) {
    if (it.flipped) { worst = Infinity; continue; }
    worst = Math.max(worst, Math.abs(it.value - median));
    maxValue = Math.max(maxValue, it.value);
  }
  // Flipped faces join the most stretched side when the piece is split.
  for (const [fi, value] of logOf) if (value === null) logOf.set(fi, Number.isFinite(maxValue) ? maxValue + 1 : 1);
  return { stretch: Math.exp(worst), logOf };
}

// Faces of one piece that stay connected without crossing a seam.
function componentsOf(faces, edgeFaces, mesh, seams) {
  const inPiece = new Set(faces);
  const parent = new Map(faces.map((fi) => [fi, fi]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const fi of faces) {
    for (const key of faceEdgeKeys(mesh.faces[fi])) {
      if (seams.has(key)) continue;
      for (const other of edgeFaces.get(key) || []) {
        if (other === fi || !inPiece.has(other)) continue;
        const a = find(fi), b = find(other);
        if (a !== b) parent.set(a, b);
      }
    }
  }
  const groups = new Map();
  for (const fi of faces) {
    const root = find(fi);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(fi);
  }
  return [...groups.values()];
}

// Edges inside a piece (between two of its faces, not already a seam).
function innerEdges(faces, edgeFaces, mesh, seams) {
  const inPiece = new Set(faces);
  const out = [];
  const seen = new Set();
  for (const fi of faces) {
    for (const key of faceEdgeKeys(mesh.faces[fi])) {
      if (seen.has(key) || seams.has(key)) continue;
      seen.add(key);
      const list = edgeFaces.get(key) || [];
      if (list.length === 2 && inPiece.has(list[0]) && inPiece.has(list[1])) out.push({ key, a: list[0], b: list[1] });
    }
  }
  return out;
}

// Axes along which a piece's faces spread, widest first (area-weighted
// principal axes of the face centres).
function spreadAxes(mesh, faces) {
  const centre = new THREE.Vector3();
  let total = 0;
  const points = faces.map((fi) => {
    const face = mesh.faces[fi];
    const c = new THREE.Vector3();
    for (const vid of face) c.add(mesh.getVertexVector(vid));
    c.divideScalar(face.length);
    const w = Math.max(mesh.getFaceArea ? mesh.getFaceArea(fi) : 1, 1e-12);
    centre.addScaledVector(c, w);
    total += w;
    return { c, w };
  });
  centre.divideScalar(total);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { c, w } of points) {
    const d = [c.x - centre.x, c.y - centre.y, c.z - centre.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += w * d[i] * d[j];
  }
  // Jacobi rotations for the symmetric 3×3 matrix.
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 20; sweep++) {
    let off = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += m[i][j] * m[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(m[p][q]) < 1e-15) continue;
      const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const mkp = m[k][p], mkq = m[k][q];
        m[k][p] = c * mkp - s * mkq; m[k][q] = s * mkp + c * mkq;
      }
      for (let k = 0; k < 3; k++) {
        const mpk = m[p][k], mqk = m[q][k];
        m[p][k] = c * mpk - s * mqk; m[q][k] = s * mpk + c * mqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const axes = [0, 1, 2].map((i) => ({ spread: m[i][i], axis: new THREE.Vector3(v[0][i], v[1][i], v[2][i]).normalize() }));
  axes.sort((a, b) => b.spread - a.spread);
  return { centre, axes: axes.map((a) => a.axis) };
}

// Flatten a piece, splitting it while it stretches the image too much: along
// its hard edges first, where a cut hides best; otherwise each way of halving
// it (between the parts the flattening stretched and squeezed, or across each
// of its spread axes) is tried and the one that stretches least is kept.
// Returns the flattened pieces.
function flattenLimited(mesh, faces, edgeFaces, seams, depth = 0, hardDone = false) {
  const island = flattenIsland(mesh, faces, edgeFaces, seams);
  if (depth >= MAX_SPLIT_DEPTH || faces.length < 2) return [island];
  const { stretch, logOf } = stretchOf(mesh, island);
  if (stretch <= STRETCH_LIMIT) return [island];
  const inner = innerEdges(faces, edgeFaces, mesh, seams);
  if (!hardDone) {
    const hard = inner.filter((e) => bendDegrees(mesh, e.a, e.b) > HARD_ANGLE + ANGLE_TOLERANCE);
    if (hard.length) {
      for (const e of hard) seams.add(e.key);
      return componentsOf(faces, edgeFaces, mesh, seams)
        .flatMap((part) => flattenLimited(mesh, part, edgeFaces, seams, depth + 1, true));
    }
  }
  // Ways to halve the piece: each says which side a face is on.
  const sides = [];
  let lo = Infinity, hi = -Infinity;
  for (const fi of faces) { const value = logOf.get(fi); lo = Math.min(lo, value); hi = Math.max(hi, value); }
  const middle = (lo + hi) / 2;
  sides.push((fi) => logOf.get(fi) > middle);
  if (faces.length <= 3000) {
    const { centre, axes } = spreadAxes(mesh, faces);
    for (const axis of axes) {
      const offset = centre.dot(axis);
      sides.push((fi) => {
        const face = mesh.faces[fi];
        let d = 0;
        for (const vid of face) d += mesh.getVertexVector(vid).dot(axis);
        return d / face.length > offset;
      });
    }
  }
  let best = null;
  for (const side of sides) {
    const between = inner.filter((e) => side(e.a) !== side(e.b));
    if (!between.length) continue;
    const trial = new Set(seams);
    for (const e of between) trial.add(e.key);
    const parts = componentsOf(faces, edgeFaces, mesh, trial);
    if (parts.length < 2) continue;
    let worst = 0;
    for (const part of parts) {
      const flatPart = flattenIsland(mesh, part, edgeFaces, trial);
      worst = Math.max(worst, part.length < 2 ? 1 : stretchOf(mesh, flatPart).stretch);
    }
    // A split that brings every part within the limit wins with the fewest
    // cuts; otherwise the one that stretches least.
    const cutCount = trial.size - seams.size;
    const ok = worst <= STRETCH_LIMIT;
    const better = !best
      || (ok && (!best.ok || cutCount < best.cutCount))
      || (!ok && !best.ok && (worst < best.worst * 0.97 || (worst <= best.worst * 1.03 && cutCount < best.cutCount)));
    if (better) best = { worst, ok, cutCount, trial, parts };
  }
  if (!best) return [island];
  for (const key of best.trial) seams.add(key);
  return best.parts.flatMap((part) => flattenLimited(mesh, part, edgeFaces, seams, depth + 1, true));
}

// Least squares conformal map (Levy et al.): two points are pinned and the rest
// solve for the flattest-angle layout, by conjugate gradient on the normal equations.
function solveConformal(pos, tris, init) {
  const n = pos.length;
  // Pin the two points farthest apart in the starting layout.
  let a = 0, b = 0, best = -1;
  let minX = Infinity, maxX = -Infinity;
  init.forEach((p, i) => { if (p[0] < minX) { minX = p[0]; a = i; } if (p[0] > maxX) { maxX = p[0]; b = i; } });
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(init[i][0] - init[a][0], init[i][1] - init[a][1]);
    if (d > best) { best = d; b = i; }
  }
  if (a === b) return null;
  const freeIndex = new Int32Array(n).fill(-1);
  let free = 0;
  for (let i = 0; i < n; i++) if (i !== a && i !== b) freeIndex[i] = free++;
  const unknowns = free * 2; // u block, then v block
  if (unknowns === 0) return null;
  const fixed = { [a]: init[a], [b]: init[b] };

  const rowStart = [0];
  const cols = [];
  const vals = [];
  const rhs = [];
  const pushRow = (entries) => {
    let r = 0;
    for (const [col, val, fixedValue] of entries) {
      if (col < 0) r -= val * fixedValue;
      else { cols.push(col); vals.push(val); }
    }
    rhs.push(r);
    rowStart.push(cols.length);
  };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), ex = new THREE.Vector3();
  for (const tri of tris) {
    const [i0, i1, i2] = tri;
    e1.subVectors(pos[i1], pos[i0]);
    e2.subVectors(pos[i2], pos[i0]);
    const x1 = e1.length();
    if (x1 < 1e-9) continue;
    ex.copy(e1).divideScalar(x1);
    const x2 = e2.dot(ex);
    const y2 = e2.clone().addScaledVector(ex, -x2).length();
    const d = x1 * y2;
    if (d < 1e-12) continue;
    const w = 1 / Math.sqrt(d);
    const W = [[(x2 - x1) * w, y2 * w], [-x2 * w, -y2 * w], [x1 * w, 0]];
    const ids = [i0, i1, i2];
    const real = [], imag = [];
    for (let j = 0; j < 3; j++) {
      const idx = ids[j];
      const f = freeIndex[idx];
      const fv = fixed[idx];
      const [wr, wi] = W[j];
      // Re = wr*u - wi*v ; Im = wi*u + wr*v
      real.push([f < 0 ? -1 : f, wr, fv ? fv[0] : 0], [f < 0 ? -1 : free + f, -wi, fv ? fv[1] : 0]);
      imag.push([f < 0 ? -1 : f, wi, fv ? fv[0] : 0], [f < 0 ? -1 : free + f, wr, fv ? fv[1] : 0]);
    }
    pushRow(real);
    pushRow(imag);
  }
  const rows = rhs.length;
  if (!rows) return null;
  const colArr = Int32Array.from(cols);
  const valArr = Float64Array.from(vals);
  const start = Int32Array.from(rowStart);
  const b2 = Float64Array.from(rhs);

  const matvec = (x, out) => {
    for (let r = 0; r < rows; r++) {
      let s = 0;
      for (let k = start[r]; k < start[r + 1]; k++) s += valArr[k] * x[colArr[k]];
      out[r] = s;
    }
  };
  const matvecT = (y, out) => {
    out.fill(0);
    for (let r = 0; r < rows; r++) {
      const yr = y[r];
      if (yr === 0) continue;
      for (let k = start[r]; k < start[r + 1]; k++) out[colArr[k]] += valArr[k] * yr;
    }
  };
  const x = new Float64Array(unknowns);
  for (let i = 0; i < n; i++) {
    if (freeIndex[i] < 0) continue;
    x[freeIndex[i]] = init[i][0];
    x[free + freeIndex[i]] = init[i][1];
  }
  const tmp = new Float64Array(rows);
  const r = new Float64Array(unknowns);
  const p = new Float64Array(unknowns);
  const q = new Float64Array(unknowns);
  matvec(x, tmp);
  for (let i = 0; i < rows; i++) tmp[i] = b2[i] - tmp[i];
  matvecT(tmp, r);
  p.set(r);
  let rr = 0;
  for (let i = 0; i < unknowns; i++) rr += r[i] * r[i];
  const rr0 = rr;
  const maxIter = Math.min(3000, unknowns * 4 + 50);
  for (let iter = 0; iter < maxIter && rr > 1e-14 * Math.max(rr0, 1e-30); iter++) {
    matvec(p, tmp);
    matvecT(tmp, q);
    let pq = 0;
    for (let i = 0; i < unknowns; i++) pq += p[i] * q[i];
    if (!(pq > 1e-30)) break;
    const alpha = rr / pq;
    let rrNew = 0;
    for (let i = 0; i < unknowns; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; rrNew += r[i] * r[i]; }
    const beta = rrNew / rr;
    rr = rrNew;
    for (let i = 0; i < unknowns; i++) p[i] = r[i] + beta * p[i];
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (freeIndex[i] < 0) out.push([fixed[i][0], fixed[i][1]]);
    else out.push([x[freeIndex[i]], x[free + freeIndex[i]]]);
  }
  return out.every((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1])) ? out : null;
}

// Convex hull (monotone chain) of 2D points.
function hullOf(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The turn that gives a piece its smallest bounding box (one of its hull's
// sides lies along an axis), then a quarter turn more if needed so it lies
// wider than tall.
function snugTurn(points) {
  const hull = hullOf(points);
  let best = 0, bestArea = Infinity, bestWide = true;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const turn = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(turn), sn = Math.sin(turn);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of hull) { const u = c * x - sn * y, v = sn * x + c * y; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea * (1 - 1e-6)) { bestArea = area; best = turn; bestWide = x1 - x0 >= y1 - y0; }
  }
  return bestWide ? best : best + Math.PI / 2;
}

// Pack pieces side by side in rows (shelves) into the 0..1 square. With
// `turn`, each piece is first turned to its snuggest box; several row widths
// are tried and the one that fills the square best is kept.
function pack(islands, { turn = false } = {}) {
  const items = islands.map((island, index) => {
    const angle = turn && island.points.length > 2 ? snugTurn(island.points) : 0;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const rot = angle ? ([u, v]) => [c * u - sn * v, sn * u + c * v] : ([u, v]) => [u, v];
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const p of island.points) { const [u, v] = rot(p); minU = Math.min(minU, u); minV = Math.min(minV, v); maxU = Math.max(maxU, u); maxV = Math.max(maxV, v); }
    return { index, rot, minU, minV, w: Math.max(1e-6, maxU - minU), h: Math.max(1e-6, maxV - minV) };
  });
  const totalArea = items.reduce((sum, it) => sum + it.w * it.h, 0);
  const pad = Math.sqrt(totalArea) * 0.02;
  const order = [...items].sort((p, q) => q.h - p.h);
  const widest = Math.max(...items.map((it) => it.w));
  const allInRow = items.reduce((sum, it) => sum + it.w + pad, 0);
  const shelve = (stripW) => {
    let x = 0, y = 0, rowH = 0, usedW = 0;
    const at = new Map();
    for (const it of order) {
      if (x > 0 && x + it.w > stripW + 1e-9) { x = 0; y += rowH + pad; rowH = 0; }
      at.set(it, [x, y]);
      x += it.w + pad;
      rowH = Math.max(rowH, it.h);
      usedW = Math.max(usedW, at.get(it)[0] + it.w);
    }
    return { at, side: Math.max(usedW, y + rowH) };
  };
  let best = null;
  const steps = 24;
  for (let k = 0; k <= steps; k++) {
    const stripW = widest + (Math.max(widest, allInRow) - widest) * (k / steps) ** 2;
    const layout = shelve(stripW);
    if (!best || layout.side < best.side - 1e-12) best = layout;
  }
  const scale = 0.96 / Math.max(best.side, 1e-6);
  const margin = 0.02;
  return items.map((it) => {
    const [ox, oy] = best.at.get(it);
    return {
      index: it.index,
      map: (p) => { const [u, v] = it.rot(p); return [round((ox + (u - it.minU)) * scale + margin), round((oy + (v - it.minV)) * scale + margin)]; },
    };
  });
}

// Do two flat triangles overlap (more than touching along a side)?
function trianglesOverlap(A, B, tol) {
  for (const T of [A, B]) {
    for (let i = 0; i < 3; i++) {
      const a = T[i], b = T[(i + 1) % 3];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const len = Math.hypot(nx, ny);
      if (len < 1e-12) continue;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A) { const d = (p[0] * nx + p[1] * ny) / len; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const p of B) { const d = (p[0] * nx + p[1] * ny) / len; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (minA >= maxB - tol || minB >= maxA - tol) return false;
    }
  }
  return true;
}

// Unfold pieces into connected layouts, like a paper net: a piece that touches
// another across a cut edge is turned flat beside it along that edge (largest
// piece first, the others around it). A piece joins only if it lands on no
// other piece of the net and the net still fills at least `minFill` of its
// bounding box, so nets stay compact enough to pack well. Returns the nets
// (piece indexes) and each piece's moved points.
function joinIslands(mesh, flat, edgeFaces, userSeams, minFill) {
  const count = flat.length;
  const pts = flat.map((island) => island.points.map((q) => [q[0], q[1]]));
  if (count < 2 || count > 400 || !(minFill <= 1)) return { nets: flat.map((_, i) => [i]), pts };
  const clusterOf = new Array(mesh.faces.length);
  flat.forEach((island, i) => island.faces.forEach((fi) => { clusterOf[fi] = i; }));
  const links = Array.from({ length: count }, () => new Map());
  for (const [key, list] of edgeFaces) {
    if (list.length !== 2 || userSeams.has(key)) continue;
    const a = clusterOf[list[0]], b = clusterOf[list[1]];
    if (a === b || a === undefined || b === undefined) continue;
    const [v1, v2] = key.split(',').map(Number);
    const len = mesh.getVertexVector(v1).distanceTo(mesh.getVertexVector(v2));
    const cur = links[a].get(b);
    if (!cur || len > cur.len) {
      const link = { key, len, v1, v2 };
      links[a].set(b, link);
      links[b].set(a, link);
    }
  }
  const info = flat.map((island) => {
    const n = new THREE.Vector3();
    let area = 0;
    for (const fi of island.faces) {
      const a = mesh.getFaceArea ? mesh.getFaceArea(fi) : 1;
      area += a;
      n.add(mesh.getFaceNormal(fi).clone().multiplyScalar(a));
    }
    return { area, up: n.lengthSq() > 0 ? n.normalize().y : 0 };
  });
  const totalArea = info.reduce((sum, it) => sum + it.area, 0);
  const tol = 1e-4 * Math.sqrt(Math.max(totalArea, 1e-9));
  // Each piece's triangles, as indexes into its points.
  const tris = flat.map((island) => island.faces.flatMap((fi) => mesh.getFaceTriangleIndices(fi)
    .map((tri) => tri.map((c) => island.surface.corner.get(`${fi}:${c}`)))));
  const flatArea = flat.map((island, i) => tris[i].reduce((sum, [a, b, c]) => sum + Math.abs(signedArea2(island.points[a], island.points[b], island.points[c])), 0));
  const order = [...info.keys()].sort((p, q) => (Math.abs(info[q].area - info[p].area) > 1e-6 * Math.max(info[q].area, info[p].area) ? info[q].area - info[p].area : info[q].up - info[p].up));
  const box = (points) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  };
  const boxesHit = (a, b) => a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol;
  const triangleList = (i, points) => tris[i].map((t) => { const T = t.map((k) => points[k]); return { T, b: box(T) }; });
  const cornerPoints = (i, fi) => mesh.faces[fi].map((_, k) => pts[i][flat[i].surface.corner.get(`${fi}:${k}`)]);
  const pointOf = (i, fi, vid) => pts[i][flat[i].surface.corner.get(`${fi}:${mesh.faces[fi].indexOf(vid)}`)];
  const centroid = (points) => [points.reduce((sum, q) => sum + q[0], 0) / points.length, points.reduce((sum, q) => sum + q[1], 0) / points.length];

  // The child's points turned and moved so its copy of the shared edge sits on the parent's.
  const alignAcross = (parent, child, link) => {
    const list = edgeFaces.get(link.key);
    const pf = list.find((fi) => clusterOf[fi] === parent);
    const cf = list.find((fi) => clusterOf[fi] === child);
    const a1 = pointOf(parent, pf, link.v1), a2 = pointOf(parent, pf, link.v2);
    const b1 = pointOf(child, cf, link.v1), b2 = pointOf(child, cf, link.v2);
    const da = [a2[0] - a1[0], a2[1] - a1[1]], db = [b2[0] - b1[0], b2[1] - b1[1]];
    if (Math.hypot(da[0], da[1]) < 1e-9 || Math.hypot(db[0], db[1]) < 1e-9) return null;
    const turn = Math.atan2(da[1], da[0]) - Math.atan2(db[1], db[0]);
    const c = Math.cos(turn), sn = Math.sin(turn);
    const from = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
    const to = [(a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2];
    const move = ([x, y]) => { const dx = x - from[0], dy = y - from[1]; return [to[0] + c * dx - sn * dy, to[1] + sn * dx + c * dy]; };
    const side = (q) => da[0] * (q[1] - a1[1]) - da[1] * (q[0] - a1[0]);
    if (side(centroid(cornerPoints(parent, pf))) * side(move(centroid(cornerPoints(child, cf)))) >= 0) return null;
    return pts[child].map(move);
  };

  const placed = new Array(count).fill(false);
  const nets = [];
  for (const root of order) {
    if (placed[root]) continue;
    placed[root] = true;
    const net = [root];
    const queue = [root];
    let netBox = box(pts[root]);
    let netArea = flatArea[root];
    let netTris = triangleList(root, pts[root]);
    while (queue.length) {
      const parent = queue.shift();
      const neighbours = [...links[parent].entries()].filter(([j]) => !placed[j]).sort((p, q) => q[1].len - p[1].len);
      for (const [child, link] of neighbours) {
        if (placed[child]) continue;
        const moved = alignAcross(parent, child, link);
        if (!moved) continue;
        const b = box(moved);
        const grown = [Math.min(netBox[0], b[0]), Math.min(netBox[1], b[1]), Math.max(netBox[2], b[2]), Math.max(netBox[3], b[3])];
        const grownArea = (grown[2] - grown[0]) * (grown[3] - grown[1]);
        if (grownArea > 0 && (netArea + flatArea[child]) / grownArea < minFill) continue;
        const childTris = triangleList(child, moved);
        const lands = childTris.some((ct) => netTris.some((nt) => boxesHit(ct.b, nt.b) && trianglesOverlap(ct.T, nt.T, tol)));
        if (lands) continue;
        pts[child] = moved;
        netBox = grown;
        netArea += flatArea[child];
        netTris = netTris.concat(childTris);
        placed[child] = true;
        net.push(child);
        queue.push(child);
      }
    }
    nets.push(net);
  }
  return { nets, pts };
}

// A long piece packs badly into a square, so it is halved across its length
// (along mesh edges) until it is at most LONG_PIECE times longer than wide.
const LONG_PIECE = 2;
function halveLong(mesh, item, depth = 0) {
  const corners = item.faces.flatMap((fi) => item.uv.get(fi));
  if (depth >= 3 || item.faces.length < 2 || corners.length < 3) return [item];
  const turn = snugTurn(corners);
  const c = Math.cos(turn), sn = Math.sin(turn);
  const along = ([u, v]) => c * u - sn * v;
  const across = ([u, v]) => sn * u + c * v;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of corners) { x0 = Math.min(x0, along(q)); x1 = Math.max(x1, along(q)); y0 = Math.min(y0, across(q)); y1 = Math.max(y1, across(q)); }
  if ((x1 - x0) <= LONG_PIECE * Math.max(y1 - y0, 1e-9)) return [item];
  const faces = item.faces.map((fi) => {
    const uv = item.uv.get(fi);
    let a = 0;
    for (let k = 0; k < uv.length; k++) { const p = uv[k], q = uv[(k + 1) % uv.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return { fi, x: uv.reduce((sum, q) => sum + along(q), 0) / uv.length, area: Math.abs(a) / 2 };
  }).sort((p, q) => p.x - q.x);
  const half = faces.reduce((sum, f) => sum + f.area, 0) / 2;
  let run = 0, cut = 0;
  while (cut < faces.length - 1 && run + faces[cut].area <= half) { run += faces[cut].area; cut++; }
  if (cut === 0) cut = 1;
  const make = (list) => ({ faces: list.map((f) => f.fi), uv: new Map(list.map((f) => [f.fi, item.uv.get(f.fi)])) });
  return [make(faces.slice(0, cut)), make(faces.slice(cut))].flatMap((part) => halveLong(mesh, part, depth + 1));
}

// Pack the items into the square; returns each face's corners, the pieces,
// how much of the square they cover, and the edges cut open (an edge whose two
// faces put its ends in different places).
function layoutOf(mesh, items, edgeFaces) {
  const packed = pack(items.map((item) => ({ points: item.faces.flatMap((fi) => item.uv.get(fi)) })), { turn: true });
  const faceUv = new Array(mesh.faces.length);
  let used = 0;
  items.forEach((item, n) => {
    const place = packed.find((p) => p.index === n).map;
    for (const fi of item.faces) {
      const uv = item.uv.get(fi).map(place);
      faceUv[fi] = uv;
      let a = 0;
      for (let k = 0; k < uv.length; k++) { const p = uv[k], q = uv[(k + 1) % uv.length]; a += p[0] * q[1] - q[0] * p[1]; }
      used += Math.abs(a) / 2;
    }
  });
  const cuts = [];
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-5 && Math.abs(p[1] - q[1]) < 1e-5;
  for (const [key, list] of edgeFaces) {
    if (list.length !== 2 || !faceUv[list[0]] || !faceUv[list[1]]) continue;
    const [v1, v2] = key.split(',').map(Number);
    const at = (fi, vid) => faceUv[fi][mesh.faces[fi].indexOf(vid)];
    if (!same(at(list[0], v1), at(list[1], v1)) || !same(at(list[0], v2), at(list[1], v2))) cuts.push([v1, v2]);
  }
  return { faceUv, islands: items.map((item) => item.faces), used, cuts };
}

// How much texture a layout uses, less a little for every edge it cuts open:
// among layouts using about the same amount, the one with fewer cuts wins.
const CUT_COST = 0.15;

export function computeUnwrap(mesh, { angle = DEFAULT_CUT_ANGLE } = {}) {
  const edgeFaces = buildEdgeFaces(mesh);
  const seams = seamSet(mesh, edgeFaces, angle);
  const islandFaces = findIslands(mesh, edgeFaces, seams);
  const flat = islandFaces.flatMap((faces) => flattenLimited(mesh, faces, edgeFaces, seams));
  const userSeams = new Set((mesh.uvSeams || []).map((e) => edgeKey(e.v1, e.v2)));
  const innerEdgeCount = Math.max(1, [...edgeFaces.values()].filter((list) => list.length === 2).length);
  // Try nets from loose (no joining) to fully joined, each with and without
  // halving long pieces, and keep the layout that uses the texture best for
  // the cuts it makes.
  const fills = flat.length > 200 ? [MIN_NET_FILL] : [Infinity, 0.85, 0.7, MIN_NET_FILL, 0.5, 0];
  let best = null;
  for (const minFill of fills) {
    const { nets, pts } = joinIslands(mesh, flat, edgeFaces, userSeams, minFill);
    const items = nets.map((net) => {
      const uv = new Map();
      for (const i of net) for (const fi of flat[i].faces) uv.set(fi, mesh.faces[fi].map((_, k) => pts[i][flat[i].surface.corner.get(`${fi}:${k}`)]));
      return { faces: net.flatMap((i) => flat[i].faces), uv };
    });
    for (const halve of [false, true]) {
      const layout = layoutOf(mesh, halve ? items.flatMap((item) => halveLong(mesh, item)) : items, edgeFaces);
      const score = layout.used - CUT_COST * (layout.cuts.length / innerEdgeCount);
      if (!best || score > best.score + 1e-9) best = { ...layout, score };
    }
  }
  return { faceCount: mesh.faces.length, angle, faces: best.faceUv, islands: best.islands, seams: best.cuts };
}

// Pack the islands again as they are now (their own sizes and turns kept), so
// pieces moved around or enlarged by hand fit the square without overlapping.
export function repackLayout(data) {
  const islands = data.islands.map((faces) => ({ points: faces.flatMap((fi) => data.faces[fi] || []) }));
  const packed = pack(islands);
  const out = data.faces.map((corners) => corners?.map((uv) => [uv[0], uv[1]]));
  data.islands.forEach((faces, i) => {
    const place = packed.find((p) => p.index === i).map;
    for (const fi of faces) out[fi] = out[fi].map((uv) => place(uv));
  });
  return { ...data, faces: out };
}

export function unwrapIsValid(mesh) {
  const data = mesh.uvUnwrap;
  return !!data && data.faceCount === mesh.faces.length && Array.isArray(data.faces);
}

// Move / scale / turn / flip one island. `fn` maps a [u, v] to a new [u, v].
export function transformIsland(data, islandIndex, fn) {
  const faces = data.faces.map((corners) => corners?.map((uv) => [uv[0], uv[1]]));
  for (const fi of data.islands[islandIndex] || []) faces[fi] = faces[fi].map((uv) => fn(uv).map(round));
  return { ...data, faces };
}

export function islandBounds(data, islandIndex) {
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const fi of data.islands[islandIndex] || []) {
    for (const [u, v] of data.faces[fi]) { minU = Math.min(minU, u); minV = Math.min(minV, v); maxU = Math.max(maxU, u); maxV = Math.max(maxV, v); }
  }
  return { minU, minV, maxU, maxV, cu: (minU + maxU) / 2, cv: (minV + maxV) / 2 };
}
