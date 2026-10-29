// Vertex bevel: replace a corner vertex with a rounded patch.
//
// Every face around the vertex loses its corner to a curved edge, and the hole
// that opens is filled with a smooth patch of quads. For a cube corner the
// result is a ball-shaped corner: each face boundary is an arc and the patch
// is a section of the sphere through those arcs.
//
//   width    — how far along each edge the bevel reaches from the vertex
//   segments — how many pieces each arc (and so the patch) is cut into
import * as THREE from 'three';
import { newVid, posKey, weldCoincidentVertices } from './meshTopology';
import { cleanupCommittedTopology } from './meshTopologyInvariants';
import { visualFaceGroups, mergeLoop, replaceFaces, firstColor } from './faceMerge';

const toVec = (v) => new THREE.Vector3(v.x, v.y, v.z);
const mod = (a, n) => ((a % n) + n) % n;

// Fill for the hole left by a vertex whose `n` faces each contribute an arc of
// `s` segments. `ringPos` holds the n*s boundary points in fan order (point
// i*s is the start of arc i). Returns { points, fixed, faces }: points[0..fixed)
// are the boundary, the rest are new interior points; faces index into points
// and wind opposite to the boundary (so they meet the surrounding faces).
//
// Layout: s = 1 is a single n-gon. Otherwise the patch is n quad grids, one per
// corner of the boundary; with an even s they meet at one centre point, with
// an odd s they are joined by a strip of quads around a centre n-gon.
export function buildCornerPatch(ringPos, n, s) {
  const ns = n * s;
  const points = ringPos.map((p) => p.clone());
  if (s === 1) {
    return { points, fixed: ns, faces: [Array.from({ length: n }, (_, i) => n - 1 - i)] };
  }
  const h = Math.floor(s / 2);
  const odd = s % 2 === 1;
  const grid = Array.from({ length: n }, () => Array.from({ length: h + 1 }, () => new Array(h + 1).fill(-1)));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a <= h; a++) {
      grid[i][a][0] = mod(i * s - a, ns);
      grid[i][0][a] = mod(i * s + a, ns);
    }
  }

  // Where each grid's inner corner starts out.
  const mean = new THREE.Vector3();
  ringPos.forEach((p) => mean.add(p));
  mean.divideScalar(ns);
  let segmentLength = 0;
  for (let r = 0; r < ns; r++) segmentLength += ringPos[r].distanceTo(ringPos[(r + 1) % ns]);
  segmentLength /= ns;
  if (!odd) {
    const c = new THREE.Vector3();
    for (let i = 0; i < n; i++) c.add(ringPos[i * s + h]);
    c.divideScalar(n);
    const center = points.push(c) - 1;
    for (let i = 0; i < n; i++) grid[i][h][h] = center;
  } else {
    const radius = segmentLength / (2 * Math.sin(Math.PI / n));
    for (let i = 0; i < n; i++) {
      const dir = ringPos[i * s].clone().sub(mean);
      if (dir.lengthSq() < 1e-18) dir.set(1, 0, 0);
      grid[i][h][h] = points.push(mean.clone().addScaledVector(dir.normalize(), radius)) - 1;
    }
  }

  // Interior points: a Coons blend of the boundary arcs and straight seams.
  const coons = (i, a, b) => {
    const g = grid[i];
    const u = a / h, v = b / h;
    const Q00 = points[g[0][0]], Q10 = points[g[h][0]], Q01 = points[g[0][h]], Q11 = points[g[h][h]];
    const A = points[g[a][0]], B = points[g[0][b]];
    const T = Q01.clone().lerp(Q11, u), R = Q10.clone().lerp(Q11, v);
    return A.clone().multiplyScalar(1 - v).addScaledVector(T, v)
      .addScaledVector(B, 1 - u).addScaledVector(R, u)
      .addScaledVector(Q00, -(1 - u) * (1 - v)).addScaledVector(Q10, -u * (1 - v))
      .addScaledVector(Q01, -(1 - u) * v).addScaledVector(Q11, -u * v);
  };
  for (let i = 0; i < n; i++) {
    for (let a = 1; a <= (odd ? h : h - 1); a++) {
      for (let b = 1; b <= h; b++) {
        if (odd && a === h && b === h) continue;
        grid[i][a][b] = points.push(coons(i, a, b)) - 1;
      }
    }
  }
  if (!odd) {
    // The seam between neighbouring grids is one shared line of points.
    for (let i = 0; i < n; i++) {
      for (let b = 1; b < h; b++) grid[i][h][b] = grid[mod(i - 1, n)][b][h];
    }
  }

  const faces = [];
  for (let i = 0; i < n; i++) {
    const g = grid[i];
    for (let a = 0; a < h; a++) {
      for (let b = 0; b < h; b++) faces.push([g[a][b], g[a + 1][b], g[a + 1][b + 1], g[a][b + 1]]);
    }
  }
  if (odd) {
    for (let i = 0; i < n; i++) {
      const prev = mod(i - 1, n);
      for (let k = 0; k < h; k++) {
        faces.push([grid[prev][k][h], grid[prev][k + 1][h], grid[i][h][k + 1], grid[i][h][k]]);
      }
    }
    faces.push(Array.from({ length: n }, (_, i) => grid[n - 1 - i][h][h]));
  }

  // Relax the interior so the grids and seams blend into one smooth surface.
  const neighbours = new Map();
  for (let p = ns; p < points.length; p++) neighbours.set(p, new Set());
  for (const f of faces) {
    for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      if (a >= ns) neighbours.get(a).add(b);
      if (b >= ns) neighbours.get(b).add(a);
    }
  }
  const tolerance = segmentLength * 1e-7;
  const sum = new THREE.Vector3();
  for (let pass = 0; pass < 160; pass++) {
    let moved = 0;
    for (const [p, around] of neighbours) {
      sum.set(0, 0, 0);
      for (const q of around) sum.add(points[q]);
      sum.divideScalar(around.size);
      moved = Math.max(moved, sum.distanceTo(points[p]));
      points[p].copy(sum);
    }
    if (moved < tolerance) break;
  }
  return { points, fixed: ns, faces };
}

const fail = (reason) => ({ ok: false, reason });

// Bevel one vertex. Returns { ok } or { ok: false, reason }.
function bevelOne(mesh, vid, radius, s) {
  const vertex = mesh.getVertex(vid);
  const touching = vertex && mesh._ensureVertexFaceMap().get(vid);
  if (!touching?.length) return fail('Select a vertex that belongs to a face');
  const { groupOf, groups } = visualFaceGroups(mesh);
  const roots = [...new Set(touching.map((fi) => groupOf[fi]))];
  if (roots.length < 3) return fail('Bevel needs a vertex with three or more faces around it');

  // One outline per visible face around the vertex.
  const fan = [];
  for (const root of roots) {
    const members = groups.get(root);
    let loop;
    if (members.length === 1) loop = [...mesh.faces[members[0]]];
    else {
      const merged = mergeLoop(mesh, members);
      if (!merged) return fail("This vertex's faces can't be beveled");
      loop = merged.loop;
    }
    const at = loop.indexOf(vid);
    if (at < 0 || loop.lastIndexOf(vid) !== at) return fail("This vertex's faces can't be beveled");
    fan.push({
      members, loop, at,
      prev: loop[mod(at - 1, loop.length)],
      next: loop[mod(at + 1, loop.length)],
    });
  }

  // Put the faces in order around the vertex: each face leaves along the edge
  // the next face arrives on.
  const byPrev = new Map(fan.map((f) => [f.prev, f]));
  if (byPrev.size !== fan.length) return fail("This vertex's faces can't be beveled");
  const order = [fan[0]];
  for (;;) {
    const following = byPrev.get(order[order.length - 1].next);
    if (!following) return fail('Bevel needs a vertex with faces all the way around it');
    if (following === order[0]) break;
    if (order.includes(following)) return fail("This vertex's faces can't be beveled");
    order.push(following);
  }
  if (order.length !== fan.length) return fail("This vertex's faces can't be beveled");
  const n = order.length;

  const V = toVec(vertex);
  const lengths = [], dirs = [];
  for (const f of order) {
    const to = toVec(mesh.getVertex(f.prev)).sub(V);
    const len = to.length();
    if (len < 1e-9) return fail("This vertex's edges are too short to bevel");
    lengths.push(len);
    dirs.push(to.divideScalar(len));
  }
  // Same reach along every edge, and never past the middle of the shortest
  // one, so neighbouring bevels can't overlap.
  const w = Math.min(radius, 0.5 * Math.min(...lengths));

  // Arc on each face from its start edge to its end edge.
  const ringPos = [];
  for (let i = 0; i < n; i++) {
    const di = dirs[i], dn = dirs[(i + 1) % n];
    const C = V.clone().addScaledVector(di, w).addScaledVector(dn, w);
    for (let k = 0; k < s; k++) {
      const t = (Math.PI / 2) * (k / s);
      ringPos.push(C.clone().addScaledVector(dn, -w * Math.cos(t)).addScaledVector(di, -w * Math.sin(t)));
    }
  }
  const patch = buildCornerPatch(ringPos, n, s);
  const ids = patch.points.map(() => newVid());
  patch.points.forEach((p, i) => mesh.vertices.push({ id: ids[i], x: p.x, y: p.y, z: p.z }));

  const removed = new Set();
  const adds = [];
  order.forEach((f, i) => {
    f.members.forEach((fi) => removed.add(fi));
    const chain = [];
    for (let k = 0; k < s; k++) chain.push(ids[i * s + k]);
    chain.push(ids[mod((i + 1) * s, n * s)]);
    adds.push({
      poly: [...f.loop.slice(0, f.at), ...chain, ...f.loop.slice(f.at + 1)],
      color: firstColor(mesh, f.members),
      tris: null,
    });
  });
  const colors = adds.map((a) => a.color);
  const sharedColor = colors.every((c) => c === colors[0]) ? colors[0] : null;
  for (const face of patch.faces) adds.push({ poly: face.map((p) => ids[p]), color: sharedColor, tris: null });
  replaceFaces(mesh, removed, adds);
  return { ok: true };
}

// Bevel every selected vertex of the selected object.
export function bevelVertices(sm, options = {}) {
  const sel = sm.selection;
  const mesh = sm.getMesh?.(sel?.meshId);
  if (!mesh || sel.type !== 'vertex' || !sel.indices?.length) return;
  const radius = Math.max(1e-6, Number(options.radius) || 0.1);
  const segments = Math.max(1, Math.min(24, Math.round(Number(options.segments) || 1)));

  // Repair split topology first (welding renumbers vertices, so find the
  // selected ones again by position).
  const wanted = new Set(sel.indices.map((i) => mesh.vertices[i]).filter(Boolean).map(posKey));
  let ids = sel.indices.map((i) => mesh.vertices[i]?.id).filter((id) => id != null);
  if (weldCoincidentVertices(mesh)) {
    ids = mesh.vertices.filter((v) => wanted.has(posKey(v))).map((v) => v.id);
  }
  mesh.lockTriangulationDiagonals();

  let changed = 0, reason = null;
  for (const vid of ids) {
    const result = bevelOne(mesh, vid, radius, segments);
    if (result.ok) changed++; else reason = result.reason;
  }
  if (!changed) {
    sm.bevelNotice = reason || "That vertex can't be beveled";
    return;
  }
  cleanupCommittedTopology(mesh);
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
  sm.updateStats();
}
