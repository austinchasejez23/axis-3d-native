import * as THREE from 'three';

// UV unwrapping. A mesh is cut into islands along its seams (seams the user
// marked, or automatic ones at sharp edges), each island is flattened with a
// least-squares conformal map so the image keeps its shapes, and the islands
// are packed into the 0..1 square with the same texel size everywhere.
// Result: mesh.uvUnwrap = { faceCount, faces: [[[u, v] per corner] per face], islands: [[face index]] }

const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
export const DEFAULT_CUT_ANGLE = 60;
export const NO_CUT_ANGLE = 180;
const round = (n) => Math.round(n * 100000) / 100000;

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

// Seams the user marked, plus every edge sharper than the cut angle.
function seamSet(mesh, edgeFaces, angle) {
  const seams = new Set((mesh.uvSeams || []).map((e) => edgeKey(e.v1, e.v2)));
  if (angle >= NO_CUT_ANGLE) return seams;
  const cos = Math.cos((angle * Math.PI) / 180);
  for (const [key, list] of edgeFaces) {
    if (list.length !== 2) continue;
    if (mesh.getFaceNormal(list[0]).dot(mesh.getFaceNormal(list[1])) < cos) seams.add(key);
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

// Pack flattened islands side by side (shelves) into the 0..1 square.
function pack(islands) {
  const items = islands.map((island, index) => {
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const [u, v] of island.points) { minU = Math.min(minU, u); minV = Math.min(minV, v); maxU = Math.max(maxU, u); maxV = Math.max(maxV, v); }
    return { index, minU, minV, w: Math.max(1e-6, maxU - minU), h: Math.max(1e-6, maxV - minV) };
  });
  const totalArea = items.reduce((s, it) => s + it.w * it.h, 0);
  const pad = Math.sqrt(totalArea) * 0.02;
  const stripW = Math.max(Math.max(...items.map((it) => it.w)), Math.sqrt(totalArea / 0.7));
  const order = [...items].sort((p, q) => q.h - p.h);
  let x = 0, y = 0, rowH = 0, usedW = 0;
  for (const it of order) {
    if (x > 0 && x + it.w > stripW) { x = 0; y += rowH + pad; rowH = 0; }
    it.ox = x; it.oy = y;
    x += it.w + pad;
    rowH = Math.max(rowH, it.h);
    usedW = Math.max(usedW, it.ox + it.w);
  }
  const usedH = y + rowH;
  const scale = 0.96 / Math.max(usedW, usedH, 1e-6);
  const margin = 0.02;
  return items.map((it) => ({
    index: it.index,
    map: ([u, v]) => [round((it.ox + (u - it.minU)) * scale + margin), round((it.oy + (v - it.minV)) * scale + margin)],
  }));
}

// Unfold pieces into one connected layout, like a paper net: a piece that
// touches another across a cut edge is turned flat beside it along that edge
// (top first, sides around it). A piece that would land on top of another stays
// loose instead. Returns the groups of piece indexes and the folded edges.
function joinIslands(mesh, flat, edgeFaces, userSeams) {
  const count = flat.length;
  const joined = new Set();
  if (count < 2 || count > 400) return { nets: flat.map((_, i) => [i]), joined };
  const clusterOf = new Array(mesh.faces.length);
  flat.forEach((island, i) => island.faces.forEach((fi) => { clusterOf[fi] = i; }));
  const links = Array.from({ length: count }, () => new Map());
  for (const [key, list] of edgeFaces) {
    if (list.length !== 2 || userSeams.has(key)) continue;
    const a = clusterOf[list[0]], b = clusterOf[list[1]];
    if (a === b) continue;
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
  const eps = 0.002 * Math.sqrt(Math.max(totalArea, 1e-9));
  const order = [...info.keys()].sort((p, q) => (Math.abs(info[q].area - info[p].area) > 1e-6 * Math.max(info[q].area, info[p].area) ? info[q].area - info[p].area : info[q].up - info[p].up));
  const box = (pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  };
  const hit = (a, b) => a[0] < b[2] - eps && b[0] < a[2] - eps && a[1] < b[3] - eps && b[1] < a[3] - eps;
  const cornerPoints = (i, fi) => mesh.faces[fi].map((_, k) => flat[i].points[flat[i].surface.corner.get(`${fi}:${k}`)]);
  const pointOf = (i, fi, vid) => flat[i].points[flat[i].surface.corner.get(`${fi}:${mesh.faces[fi].indexOf(vid)}`)];
  const centroid = (pts) => [pts.reduce((sum, q) => sum + q[0], 0) / pts.length, pts.reduce((sum, q) => sum + q[1], 0) / pts.length];

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
    return flat[child].points.map(move);
  };

  const placed = new Array(count).fill(false);
  const boxes = new Array(count);
  const nets = [];
  for (const root of order) {
    if (placed[root]) continue;
    placed[root] = true;
    boxes[root] = box(flat[root].points);
    const net = [root];
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift();
      const neighbours = [...links[parent].entries()].filter(([j]) => !placed[j]).sort((p, q) => q[1].len - p[1].len);
      for (const [child, link] of neighbours) {
        if (placed[child]) continue;
        const moved = alignAcross(parent, child, link);
        if (!moved) continue;
        const b = box(moved);
        if (net.some((j) => j !== parent && hit(boxes[j], b))) continue;
        flat[child].points = moved;
        boxes[child] = b;
        placed[child] = true;
        net.push(child);
        queue.push(child);
        joined.add(link.key);
      }
    }
    nets.push(net);
  }
  return { nets, joined };
}

export function computeUnwrap(mesh, { angle = DEFAULT_CUT_ANGLE } = {}) {
  const edgeFaces = buildEdgeFaces(mesh);
  const seams = seamSet(mesh, edgeFaces, angle);
  const islandFaces = findIslands(mesh, edgeFaces, seams);
  const flat = [];
  for (const faces of islandFaces) {
    let surface = cutSurface(mesh, faces, edgeFaces, seams);
    for (let i = 0; i < 3 && surface.chi !== 1; i++) {
      if (!cutOnce(mesh, faces, surface, seams)) break;
      surface = cutSurface(mesh, faces, edgeFaces, seams);
    }
    flat.push({ faces, surface, points: flatten(mesh, faces, surface) });
  }
  const { nets, joined } = joinIslands(mesh, flat, edgeFaces, new Set((mesh.uvSeams || []).map((e) => edgeKey(e.v1, e.v2))));
  const packed = pack(nets.map((net) => ({ points: net.flatMap((i) => flat[i].points) })));
  const faceUv = new Array(mesh.faces.length);
  nets.forEach((net, n) => {
    const place = packed.find((p) => p.index === n).map;
    for (const i of net) {
      const island = flat[i];
      for (const fi of island.faces) {
        faceUv[fi] = mesh.faces[fi].map((_, k) => place(island.points[island.surface.corner.get(`${fi}:${k}`)]));
      }
    }
  });
  // Where the surface was cut open, for showing on the model (folds are not cuts).
  const cuts = [];
  for (const key of seams) if ((edgeFaces.get(key) || []).length && !joined.has(key)) cuts.push(key.split(',').map(Number));
  return { faceCount: mesh.faces.length, angle, faces: faceUv, islands: nets.map((net) => net.flatMap((i) => flat[i].faces)), seams: cuts };
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

// Mark the selected edges as seams, or clear them when they all already are.
export function toggleSeamsOnSelection(sm) {
  sm.toolNotice = null;
  const sel = sm.selection;
  const mesh = sm.getMesh?.(sel?.meshId);
  if (!mesh || sel.type !== 'edge' || !sel.indices?.length) { sm.toolNotice = 'Select one or more edges to mark as a seam'; return false; }
  const edges = mesh.getEdges();
  const pairs = sel.indices.map((i) => edges[i]).filter(Boolean).map((e) => [e.v1, e.v2]);
  if (!pairs.length) { sm.toolNotice = 'Select one or more edges to mark as a seam'; return false; }
  const snapshot = sm.captureSnapshot();
  const current = new Set((mesh.uvSeams || []).map((e) => edgeKey(e.v1, e.v2)));
  const allSeams = pairs.every(([a, b]) => current.has(edgeKey(a, b)));
  if (allSeams) {
    const drop = new Set(pairs.map(([a, b]) => edgeKey(a, b)));
    mesh.uvSeams = (mesh.uvSeams || []).filter((e) => !drop.has(edgeKey(e.v1, e.v2)));
  } else {
    mesh.uvSeams = [...(mesh.uvSeams || [])];
    for (const [a, b] of pairs) if (!current.has(edgeKey(a, b))) mesh.uvSeams.push({ v1: a, v2: b });
  }
  sm.pushUndoSnapshot(snapshot);
  sm.editVersion = (sm.editVersion || 0) + 1;
  sm.toolNotice = allSeams
    ? 'Seam cleared'
    : `${mesh.uvSeams.length} seam edge${mesh.uvSeams.length === 1 ? '' : 's'} marked. Unwrap in the Texture tab uses them.`;
  return true;
}
