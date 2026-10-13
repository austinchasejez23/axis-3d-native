import * as THREE from 'three';
import { newVid, edgeKey, posKey, adjacentFaceIndicesForEdge, weldCoincidentVertices } from './meshTopology';
import { createPipeBendSweep } from './pipeBendCode';

// Multi-segment edge-LOOP bevel.
//
// The previous implementation beveled each selected edge on its own, generating
// its own pair of rail vertices, then tried to stitch neighbouring rails back
// together at the corners. Every corner therefore started life as two separate
// vertices, and the stitch could not keep them consistent — which is what made
// the band fan out, overlap and collapse into wedges.
//
// This version works on the loop as one object:
//   * the selected edges are chained into an ordered vertex loop (N vertices),
//   * the faces are split into the two regions the loop divides,
//   * each loop VERTEX gets exactly ONE mitered offset point per side, shared by
//     both of its edges,
//   * segments+1 rings of exactly N vertices are swept along a circular arc
//     between those two offsets, in the same cyclic order,
//   * rings are joined by quads, vertex i to vertex i.
// So ring k vertex i always corresponds to loop vertex i: no duplicate corners,
// no twisting, and segment count subdivides the arc without widening it.

const V3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
const keyOf = posKey;

// Chain {v1,v2} edges into one ordered vertex sequence.
export function orderLoop(edgeList) {
  const adj = new Map();
  for (const e of edgeList) {
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push(e.v2);
    adj.get(e.v2).push(e.v1);
  }
  let start = null;
  for (const [v, n] of adj) if (n.length === 1) { start = v; break; }
  const open = start !== null;
  if (start === null) start = adj.keys().next().value;
  if (start === undefined) return null;
  const order = [start];
  const seen = new Set([start]);
  let prev = null, cur = start;
  for (;;) {
    const next = (adj.get(cur) || []).find((v) => v !== prev && !seen.has(v));
    if (next === undefined) break;
    order.push(next);
    seen.add(next);
    prev = cur;
    cur = next;
  }
  if (order.length !== adj.size) return null; // branched selection
  const closed = !open && order.length >= 3 && (adj.get(order[order.length - 1]) || []).includes(start);
  return { order, closed };
}

// Faces reachable from `seed` without crossing any loop edge.
function regionFrom(mesh, seed, blocked) {
  const map = new Map();
  for (let i = 0; i < mesh.faces.length; i++) {
    const f = mesh.faces[i];
    for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  }
  const seen = new Set([seed]);
  const stack = [seed];
  while (stack.length) {
    const f = mesh.faces[stack.pop()];
    for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      if (blocked.has(k)) continue;
      for (const n of map.get(k) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return seen;
}

// Assign, for every loop edge, which adjacent face belongs to side A and which
// to side B. Preferred method: the loop cuts the surface in two, so a flood fill
// that cannot cross the loop reaches exactly one side. If the loop does not
// separate the mesh, fall back to walking the loop and keeping the side whose
// normal continues the previous one.
export function classifySides(mesh, loopEdges, blocked) {
  const first = adjacentFaceIndicesForEdge(mesh, loopEdges[0].v1, loopEdges[0].v2);
  if (first.length !== 2) return null;
  const region = regionFrom(mesh, first[0], blocked);
  const sides = [];
  let usable = true;
  for (const e of loopEdges) {
    const adj = adjacentFaceIndicesForEdge(mesh, e.v1, e.v2);
    if (adj.length !== 2) return null;
    const inA = adj.filter((f) => region.has(f));
    if (inA.length !== 1) { usable = false; break; }
    sides.push({ a: inA[0], b: adj.find((f) => f !== inA[0]) });
  }
  // `region` is the COMPLETE set of faces on side A — including faces that only
  // touch the loop at a single vertex. Those exist all over a triangulated mesh
  // and must be re-pointed at the new ring too; missing them tears holes.
  if (usable) return { sides, region };

  const out = [];
  let refA = mesh.getFaceNormal(first[0]);
  let refB = mesh.getFaceNormal(first[1]);
  for (const e of loopEdges) {
    const adj = adjacentFaceIndicesForEdge(mesh, e.v1, e.v2);
    if (adj.length !== 2) return null;
    const n0 = mesh.getFaceNormal(adj[0]), n1 = mesh.getFaceNormal(adj[1]);
    const straight = n0.dot(refA) + n1.dot(refB);
    const swapped = n1.dot(refA) + n0.dot(refB);
    const a = straight >= swapped ? adj[0] : adj[1];
    const b = adj.find((f) => f !== a);
    out.push({ a, b });
    refA = mesh.getFaceNormal(a);
    refB = mesh.getFaceNormal(b);
  }
  return { sides: out, region: null };
}

// In-plane direction leaving edge `e` across face `fi`, perpendicular to the edge.
function outDir(mesh, fi, v1, v2) {
  const A = mesh.getVertex(v1), B = mesh.getVertex(v2);
  const t = new THREE.Vector3(B.x - A.x, B.y - A.y, B.z - A.z).normalize();
  const d = new THREE.Vector3().crossVectors(mesh.getFaceNormal(fi), t);
  if (d.lengthSq() < 1e-16) return null;
  d.normalize();
  const mid = new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  const c = mesh.getFaceCenter(fi).sub(mid);
  if (d.dot(c) < 0) d.negate();
  return d;
}

// How far face `fi` extends away from edge (v1,v2) along `dir`.
function reachAlong(mesh, fi, v1, v2, dir) {
  const A = mesh.getVertex(v1), B = mesh.getVertex(v2);
  const mid = new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  let r = 0;
  for (const vid of mesh.faces[fi]) {
    if (vid === v1 || vid === v2) continue;
    const p = V3(mesh.getVertex(vid)).sub(mid);
    r = Math.max(r, p.dot(dir));
  }
  return r;
}

// Circular arc between the two offset points, tangent to both sides.
export function arcSampler(v, pA, pB) {
  const uA = pA.clone().sub(v);
  const uB = pB.clone().sub(v);
  const lA = uA.length(), lB = uB.length();
  if (lA < 1e-9 || lB < 1e-9) return (t) => pA.clone().lerp(pB, t);
  const nA = uA.clone().divideScalar(lA);
  const nB = uB.clone().divideScalar(lB);
  const d = Math.min(1, Math.max(-1, nA.dot(nB)));
  if (d > 0.9999 || d < -0.9999) return (t) => pA.clone().lerp(pB, t);
  // True fillet center: on the bisector, at distance t / cos(half-angle) from
  // the corner. That is the ONLY point equidistant (= the fillet radius) from
  // both offset points, so the sweep is a real circular arc. The previous
  // formula placed the center about half that far out, which flattened the
  // sweep into a near-straight chord with evenly spaced, equal-size facets.
  const bis = nA.clone().add(nB);
  if (bis.lengthSq() < 1e-12) return (t) => pA.clone().lerp(pB, t);
  bis.normalize();
  const cosHalf = Math.max(1e-4, nA.dot(bis));
  const s = ((lA + lB) / 2) / cosHalf;
  const center = v.clone().addScaledVector(bis, s);
  const wA = pA.clone().sub(center);
  const wB = pB.clone().sub(center);
  const rA = wA.length(), rB = wB.length();
  if (rA < 1e-9 || rB < 1e-9) return (t) => pA.clone().lerp(pB, t);
  const hA = wA.clone().divideScalar(rA);
  const hB = wB.clone().divideScalar(rB);
  const omega = Math.acos(Math.min(1, Math.max(-1, hA.dot(hB))));
  return (t) => {
    let dir;
    if (omega < 1e-6) {
      dir = hA.clone().lerp(hB, t).normalize();
    } else {
      const so = Math.sin(omega);
      dir = hA.clone().multiplyScalar(Math.sin((1 - t) * omega) / so)
        .addScaledVector(hB, Math.sin(t * omega) / so)
        .normalize();
    }
    return center.clone().addScaledVector(dir, rA + (rB - rA) * t);
  };
}

export function bevelLoopEdges(sm, options = {}) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;

  // Preserve every pre-existing cylinder/quad triangulation diagonal before
  // neighboring faces are reshaped into bevel polygons.
  mesh.lockTriangulationDiagonals();
  let edges = mesh.getEdges();
  if (!edges) return;

  // Repair split topology, then re-find the selected edges by position (welding
  // renumbers vertices, so the old indices no longer apply).
  const picked = sel.indices.map((i) => edges[i]).filter(Boolean)
    .map((e) => [mesh.getVertex(e.v1), mesh.getVertex(e.v2)].map(keyOf).sort().join('|'));
  if (weldCoincidentVertices(mesh)) {
    edges = mesh.getEdges();
    const want = new Set(picked);
    const found = [];
    edges.forEach((e, i) => {
      const k = [mesh.getVertex(e.v1), mesh.getVertex(e.v2)].map(keyOf).sort().join('|');
      if (want.has(k)) found.push(i);
    });
    sel.indices = found;
  }

  const loopEdgesRaw = sel.indices.map((i) => edges[i]).filter(Boolean).map((e) => ({ v1: e.v1, v2: e.v2 }));
  if (loopEdgesRaw.length === 0) return;
  if (!options._singleComponent) {
    const pending = new Set(loopEdgesRaw.map((_, i) => i));
    const groups = [];
    while (pending.size) {
      const seed = pending.values().next().value;
      pending.delete(seed);
      const group = [loopEdgesRaw[seed]];
      const vids = new Set([loopEdgesRaw[seed].v1, loopEdgesRaw[seed].v2]);
      let found = true;
      while (found) {
        found = false;
        for (const i of [...pending]) {
          const e = loopEdgesRaw[i];
          if (!vids.has(e.v1) && !vids.has(e.v2)) continue;
          pending.delete(i);
          group.push(e);
          vids.add(e.v1);
          vids.add(e.v2);
          found = true;
        }
      }
      groups.push(group);
    }
    if (groups.length > 1) {
      for (const group of groups) {
        const wanted = new Set(group.map(e => edgeKey(e.v1, e.v2)));
        const indices = mesh.getEdges().map((e, i) => wanted.has(edgeKey(e.v1, e.v2)) ? i : -1).filter(i => i >= 0);
        if (indices.length !== group.length) continue;
        sm.setSelection({ meshId: mesh.id, type: 'edge', indices });
        bevelLoopEdges(sm, { ...options, _singleComponent: true });
      }
      sm.clearSelection();
      return;
    }
  }
  const chain = orderLoop(loopEdgesRaw);
  if (!chain || chain.order.length < 2) return;
  const { order, closed } = chain;
  const N = order.length;

  const blocked = new Set(loopEdgesRaw.map((e) => edgeKey(e.v1, e.v2)));
  // Loop edges in walk order, so side classification follows the loop.
  const walk = [];
  for (let i = 0; i < (closed ? N : N - 1); i++) walk.push({ v1: order[i], v2: order[(i + 1) % N] });
  const classified = classifySides(mesh, walk, blocked);
  if (!classified) return;
  const { sides, region } = classified;

  const segments = Math.max(1, Math.min(24, Math.round(options.segments || 1)));
  const sweep = !!options.sweep;
  const smooth = !!options.smooth && !sweep;
  const requested = Math.max(0.001, Number(options.radius) || 0.1);

  // Per-edge offset directions on each side, plus how much room that side has.
  const perEdge = [];
  let limit = Infinity;
  let cosSum = 0;
  for (let i = 0; i < walk.length; i++) {
    const { v1, v2 } = walk[i];
    const dA = outDir(mesh, sides[i].a, v1, v2);
    const dB = outDir(mesh, sides[i].b, v1, v2);
    if (!dA || !dB) return;
    limit = Math.min(limit, reachAlong(mesh, sides[i].a, v1, v2, dA) || Infinity);
    limit = Math.min(limit, reachAlong(mesh, sides[i].b, v1, v2, dB) || Infinity);
    cosSum += Math.max(-0.999, Math.min(0.999, dA.dot(dB)));
    perEdge.push({ dA, dB, nA: mesh.getFaceNormal(sides[i].a), nB: mesh.getFaceNormal(sides[i].b) });
  }

  // Keep both leg directions assigned consistently around a faceted transverse
  // loop. Face-region classification can reverse A/B on individual facets even
  // though they all belong to the same two straight sections; that reversal made
  // the shared-axis vectors cancel and incorrectly fell back to separate edge
  // fillets. Match every pair to the first pair before calculating the sweep.
  if (perEdge.length > 1) {
    const refA = perEdge[0].dA;
    const refB = perEdge[0].dB;
    for (let i = 1; i < perEdge.length; i++) {
      const pe = perEdge[i];
      const direct = pe.dA.dot(refA) + pe.dB.dot(refB);
      const swapped = pe.dA.dot(refB) + pe.dB.dot(refA);
      if (swapped > direct) {
        [pe.dA, pe.dB] = [pe.dB, pe.dA];
        [pe.nA, pe.nB] = [pe.nB, pe.nA];
        // Keep the actual adjacent faces paired with the directions. Swapping
        // only the vectors made later face remapping attach a face to the
        // opposite bevel rail, crossing and collapsing the strip.
        [sides[i].a, sides[i].b] = [sides[i].b, sides[i].a];
      }
    }
  }
  // Normal bevel uses the entered value as an equal setback on both faces —
  // the conventional same-width edge bevel. Sweep preserves the former radius
  // behavior, where the value is the radius of the shared section bend.
  let maxAmount = Number.isFinite(limit) && limit > 1e-6 ? limit * 0.9 : Infinity;
  if (sweep) {
    const avgCos = THREE.MathUtils.clamp(cosSum / Math.max(1, walk.length), -0.999999, 0.999999);
    const turnAngle = Math.PI - Math.acos(avgCos);
    const tanHalfTurn = Math.tan(turnAngle * 0.5);
    if (Number.isFinite(limit) && limit > 1e-6 && tanHalfTurn > 1e-6) {
      maxAmount = (limit * 0.9) / tanHalfTurn;
    }
  }
  // A pipe sweep is allowed to extend its tangent points along the adjoining
  // legs, so clamping it to the selected faces' local width made the Radius
  // control stop changing above a very small value. The ordinary bevel still
  // keeps its self-intersection clamp; Sweep uses the entered bend radius.
  const r = sweep ? requested : (Number.isFinite(maxAmount) ? Math.min(requested, maxAmount) : requested);

  // Edges incident to each loop vertex (one for chain ends, two otherwise).
  const at = order.map(() => []);
  for (let i = 0; i < walk.length; i++) {
    at[i % N].push(i);
    at[(i + 1) % N].push(i);
  }

  // Closed transverse loops should keep their cross-section rigid. Averaging
  // each side's directions removes per-face lateral components that otherwise
  // pull loop corners apart into wedges. If the directions cancel (a different
  // kind of loop), the ordinary per-corner miter remains the safe fallback.
  const sharedDirection = (key) => {
    if (!closed || perEdge.length < 2) return null;
    const sum = new THREE.Vector3();
    for (const edge of perEdge) sum.add(edge[key]);
    if (sum.lengthSq() < 1e-12) return null;
    const unit = sum.clone().normalize();
    // Every edge has to genuinely leave along this one direction. An average
    // that merely points somewhere is not enough: on a ring loop around a
    // tapered surface (a cone, a pyramid tip, a chamfered shoulder) each face
    // leans inward a different way and those components cancel, leaving a bare
    // axial vector. Using it pushed every corner straight along the axis
    // instead of along its own face, so no chamfer was built, the sharp edge
    // survived and the shape grew instead of being cut back.
    let worst = 1;
    for (const edge of perEdge) worst = Math.min(worst, edge[key].dot(unit));
    return worst > 0.999 ? unit : null;
  };
  const sharedA = sharedDirection('dA');
  const sharedB = sharedDirection('dB');

  // ONE offset point per side per loop vertex — shared by both incident edges.
  const rings = [];
  for (let s = 0; s <= segments; s++) rings.push(new Array(N));
  const vertRef = new Array(N);
  const originals = [];
  const corners = new Array(N);

  for (let i = 0; i < N; i++) {
    const vid = order[i];
    const vv = V3(mesh.getVertex(vid));
    originals.push(vid);
    const inc = at[i];
    const mitered = (pick) => {
      const shared = pick === 'dA' ? sharedA : sharedB;
      if (shared) return vv.clone().addScaledVector(shared, r);
      const dirs = inc.map((ei) => perEdge[ei][pick]);
      const bis = new THREE.Vector3();
      for (const d of dirs) bis.add(d);
      if (bis.lengthSq() < 1e-16) return vv.clone().addScaledVector(dirs[0], r);
      bis.normalize();
      let cos = 1;
      for (const d of dirs) cos = Math.min(cos, bis.dot(d));
      const len = r / Math.max(0.25, cos);
      return vv.clone().addScaledVector(bis, len);
    };
    const pA = mitered('dA');
    const pB = mitered('dB');
    const ref = new THREE.Vector3();
    for (const ei of inc) ref.add(perEdge[ei].nA).add(perEdge[ei].nB);
    vertRef[i] = ref.lengthSq() > 1e-12 ? ref.normalize() : new THREE.Vector3(0, 1, 0);
    corners[i] = { vv, pA, pB };
  }

  // Tube / prism bend: when every loop vertex leaves the loop in the SAME
  // direction on each side (a bent tube, pipe or prism), the whole loop shares
  // one bend plane. Sweep every vertex around the ONE common bend axis instead
  // of giving each vertex its own little fillet. Rings then become radial
  // slices through the bend center — inner-wall vertices travel a short arc and
  // outer-wall vertices a long one — so segment spacing naturally tapers toward
  // the inside of the bend and fans out on the outside, like a real pipe elbow.
  // TRUE leg axes, measured from the longitudinal wall edges (loop vertex →
  // its counterpart across each wall face). The in-plane perEdge directions
  // tilt with the miter — up to half the bend angle — so averaging them gave a
  // wrong bend plane/angle and sheared the elbow. The wall edges run exactly
  // along each straight leg, and their lateral components cancel around the
  // closed loop.
  const loopSet = new Set(order);
  const legAxis = (faceIdxs) => {
    const d = new THREE.Vector3();
    for (const fi of new Set(faceIdxs)) {
      const f = mesh.faces[fi];
      const loopVs = f.filter((v) => loopSet.has(v));
      if (loopVs.length === 0) continue;
      for (const w of f) {
        if (loopSet.has(w)) continue;
        const pw = V3(mesh.getVertex(w));
        let best = null, bd = Infinity;
        for (const v of loopVs) {
          const dist = pw.distanceToSquared(V3(mesh.getVertex(v)));
          if (dist < bd) { bd = dist; best = v; }
        }
        const dir = pw.sub(V3(mesh.getVertex(best)));
        if (dir.lengthSq() > 1e-12) d.add(dir.normalize());
      }
    }
    return d.lengthSq() > 1e-12 ? d.normalize() : null;
  };

  // The pipe/prism bend sweep only makes sense for a CLOSED transverse loop —
  // a tube or prism cross-section sharing one common bend axis. Applied to an
  // open chain (above all a single selected edge) it swings the loop vertices
  // around an invented bend center and shreds the geometry. An open chain is
  // always a plain per-vertex fillet.
  const tubeSweep = sweep && closed
    ? createPipeBendSweep({
      perEdge,
      corners,
      radius: r,
      legA: legAxis(sides.map((s) => s.a)),
      legB: legAxis(sides.map((s) => s.b)),
    })
    : null;

  for (let i = 0; i < N; i++) {
    const { vv, pA, pB } = corners[i];
    const sample = tubeSweep
      ? (t) => tubeSweep(i, t)
      : sweep || smooth
        ? arcSampler(vv, pA, pB)
        : (t) => pA.clone().lerp(pB, t);
    for (let s = 0; s <= segments; s++) {
      const p = sample(segments === 0 ? 0 : s / segments);
      const nv = { id: newVid(), x: p.x, y: p.y, z: p.z };
      mesh.vertices.push(nv);
      rings[s][i] = nv.id;
    }
  }

  // Side A keeps the first ring, side B the last one. Every face that used a
  // loop vertex is re-pointed — including faces meeting the loop at just one
  // vertex, which is most of a triangulated surface around the loop.
  //
  // Faces that touch the loop ONLY at a vertex (no loop edge) and cannot be
  // classified by region — e.g. the top/bottom faces at the two ends of a
  // single beveled cube edge — must NOT be snapped to one ring: that moved
  // their corner onto one side's offset and tore a notch open on the other
  // side. Instead their corner vertex is replaced by the WHOLE arc, so the
  // face wraps around the bevel end and the surface stays closed.
  const sideA = new Set(sides.map((s) => s.a));
  const sideB = new Set(sides.map((s) => s.b));
  const idxOf = new Map(order.map((vid, i) => [vid, i]));
  const arcUsedAt = new Set();
  const P = (id) => V3(mesh.getVertex(id));

  // Classify each vertex-only face (touches the loop but shares no loop edge,
  // and the loop does not separate the mesh) by which side it sits on. The
  // classification must be by COPLANAR REGION, not per-triangle edge-adjacency:
  // a triangulated cap (a box's top face = two triangles, a cone's apex fan)
  // has each triangle border only ONE side, so per-triangle adjacency split it
  // between side A and side B, snapped the two halves to different rings and
  // opened a hole. Flood each side's bevel triangles across coplanar adjacent
  // faces; a vertex-only face in the A region snaps to ring[0], the B region
  // to ring[segments], and anything else touching the loop only at a vertex is
  // a cap that wraps the arc.
  const edgeFaceMap = new Map();
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    for (let j = 0; j < f.length; j++) {
      const k = edgeKey(f[j], f[(j + 1) % f.length]);
      if (!edgeFaceMap.has(k)) edgeFaceMap.set(k, []);
      edgeFaceMap.get(k).push(fi);
    }
  }
  const coplanar = (fi, nfi) => {
    const a = mesh.getFaceNormal(fi), b = mesh.getFaceNormal(nfi);
    if (Math.abs(a.dot(b)) < 0.9999) return false;
    return mesh.faces[fi].some((v) => mesh.faces[nfi].includes(v));
  };
  const sideRegion = (seedSet) => {
    const reg = new Set(seedSet);
    const stack = [...seedSet];
    while (stack.length) {
      const fi = stack.pop();
      const f = mesh.faces[fi];
      for (let j = 0; j < f.length; j++) {
        const k = edgeKey(f[j], f[(j + 1) % f.length]);
        for (const nfi of edgeFaceMap.get(k) || []) {
          if (nfi === fi || reg.has(nfi)) continue;
          if (coplanar(fi, nfi)) { reg.add(nfi); stack.push(nfi); }
        }
      }
    }
    return reg;
  };
  const sideARegion = sideRegion(sideA);
  const sideBRegion = sideRegion(sideB);
  const onA = new Array(mesh.faces.length).fill(false);
  const onB = new Array(mesh.faces.length).fill(false);
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    onA[fi] = sideARegion.has(fi);
    onB[fi] = sideBRegion.has(fi);
  }

  // Merge coplanar cap fans at each OPEN endpoint into ONE polygon before the
  // arc is inserted. A triangulated cap — a box's top face (two triangles), a
  // cone's apex fan (many triangles) — is several faces all sharing the loop
  // vertex. Inserting the arc into each one duplicated the arc's segment edges
  // and made them non-manifold (the doubled/jagged line); inserting it into
  // only one left the other half uncapped (the hole). Merging the fan first
  // means the arc is inserted exactly once, so the cap stays closed and
  // manifold. Only done for open loops whose loop does not separate the mesh
  // (the single-edge / short-loop case); separating loops use region snap.
  if (!closed && !region) {
    const sharesLoopEdgeOf = (fi) => {
      const f = mesh.faces[fi];
      return f.some((vid, j) => {
        const nx = f[(j + 1) % f.length];
        return idxOf.has(vid) && idxOf.has(nx) && blocked.has(edgeKey(vid, nx));
      });
    };
    const capGroup = new Map(); // endpoint loop-vertex index -> Set(faceIdx)
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const f = mesh.faces[fi];
      if (!f.some((vid) => idxOf.has(vid))) continue;
      if (sharesLoopEdgeOf(fi)) continue;
      if (onA[fi] || onB[fi]) continue; // a cap is in neither side region
      const touched = f.filter((v) => idxOf.has(v)).map((v) => idxOf.get(v));
      if (touched.length !== 1) continue; // multi-vertex caps handled individually
      const i = touched[0];
      // Only the two ends of an open chain need arc caps. Treating an internal
      // chain corner as a cap inserts the whole bevel arc into an unrelated face.
      if (i !== 0 && i !== N - 1) continue;
      if (!capGroup.has(i)) capGroup.set(i, new Set());
      capGroup.get(i).add(fi);
    }
    for (const [i, fiset] of capGroup) {
      if (fiset.size <= 1) continue;
      // Boundary edges of the union appear once; shared (internal) edges twice.
      const ecount = new Map();
      for (const fi of fiset) {
        const f = mesh.faces[fi];
        for (let j = 0; j < f.length; j++) {
          const k = edgeKey(f[j], f[(j + 1) % f.length]);
          ecount.set(k, (ecount.get(k) || 0) + 1);
        }
      }
      const adj = new Map();
      for (const fi of fiset) {
        const f = mesh.faces[fi];
        for (let j = 0; j < f.length; j++) {
          const a = f[j], b = f[(j + 1) % f.length];
          if (ecount.get(edgeKey(a, b)) !== 1) continue;
          if (!adj.has(a)) adj.set(a, []);
          if (!adj.has(b)) adj.set(b, []);
          adj.get(a).push(b);
          adj.get(b).push(a);
        }
      }
      // Walk from the endpoint's real vertex ID. `i` is only its position in
      // the ordered chain; using it as an ID connected the cap to an unrelated
      // vertex and produced the long triangular spike.
      const endpointVid = order[i];
      let cur = endpointVid, prev = null;
      const poly = [cur];
      for (let guard = 0; guard < 1000; guard++) {
        const next = (adj.get(cur) || []).find((x) => x !== prev);
        if (next === undefined || next === endpointVid) break;
        poly.push(next);
        prev = cur; cur = next;
      }
      if (poly.length >= 3) {
        let rep = -1;
        for (const fi of fiset) {
          if (rep < 0) rep = fi;
          else mesh.faces[fi] = []; // consumed by the merge
        }
        mesh.faces[rep] = poly;
      }
    }
  }

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (!f.some((vid) => idxOf.has(vid))) continue;
    const sharesLoopEdge = f.some((vid, j) => {
      const nx = f[(j + 1) % f.length];
      return idxOf.has(vid) && idxOf.has(nx) && blocked.has(edgeKey(vid, nx));
    });
    if (sharesLoopEdge || region) {
      const inA = region ? region.has(fi) : sideA.has(fi);
      const ring = inA ? rings[0] : rings[segments];
      mesh.faces[fi] = f.map((vid) => (idxOf.has(vid) ? ring[idxOf.get(vid)] : vid));
      continue;
    }
    // Vertex-only face, loop does not separate the mesh. A face in the A
    // region snaps to ring[0], the B region to ring[segments]. A cap (in
    // NEITHER region) wraps the arc — and because coplanar cap fans were
    // merged above, only one cap polygon per endpoint remains, so the arc is
    // inserted exactly once and the surface stays closed and manifold.
    const touchedLoopIndices = f.filter((vid) => idxOf.has(vid)).map((vid) => idxOf.get(vid));
    const touchesOnlyOpenEnds = touchedLoopIndices.every((i) => i === 0 || i === N - 1);
    const isCap = !onA[fi] && !onB[fi] && touchesOnlyOpenEnds;
    if (!isCap) {
      const ring = onA[fi] ? rings[0] : rings[segments];
      mesh.faces[fi] = f.map((vid) => (idxOf.has(vid) ? ring[idxOf.get(vid)] : vid));
      continue;
    }
    const out = [];
    for (let j = 0; j < f.length; j++) {
      const vid = f[j];
      if (!idxOf.has(vid)) { out.push(vid); continue; }
      const i = idxOf.get(vid);
      if (arcUsedAt.has(i)) { out.push(rings[0][i]); continue; }
      arcUsedAt.add(i);
      const arc = [];
      for (let s = 0; s <= segments; s++) arc.push(rings[s][i]);
      // Orient the arc to match the face's winding: its first point should be
      // the one nearer the previous boundary vertex.
      const prev = mesh.getVertex(f[(j - 1 + f.length) % f.length]);
      if (prev) {
        const pv = V3(prev);
        if (pv.distanceToSquared(P(arc[arc.length - 1])) < pv.distanceToSquared(P(arc[0]))) arc.reverse();
      }
      out.push(...arc);
    }
    mesh.faces[fi] = out;
  }

  // Ring-to-ring quads, vertex i to vertex i.
  const addQuad = (a, b, c, d, ref) => {
    const P = (id) => V3(mesh.getVertex(id));
    const p0 = P(a), p1 = P(b), p2 = P(c);
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
    if (n.dot(ref) < 0) mesh.faces.push([a, d, c, b]);
    else mesh.faces.push([a, b, c, d]);
  };
  const span = closed ? N : N - 1;
  for (let s = 0; s < segments; s++) {
    for (let i = 0; i < span; i++) {
      const j = (i + 1) % N;
      const ref = vertRef[i].clone().add(vertRef[j]).normalize();
      addQuad(rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i], ref);
    }
  }

  // Open chain: close the two exposed ends with one polygon each — unless a
  // surrounding face already wrapped that end via the arc insertion above.
  if (!closed) {
    for (const i of [0, N - 1]) {
      if (arcUsedAt.has(i)) continue;
      const col = [];
      for (let s = 0; s <= segments; s++) col.push(rings[s][i]);
      if (col.length < 3) continue;
      const other = i === 0 ? 1 : N - 2;
      const ref = V3(mesh.getVertex(rings[0][i])).sub(V3(mesh.getVertex(rings[0][other])));
      const p0 = V3(mesh.getVertex(col[0]));
      const n = new THREE.Vector3()
        .subVectors(V3(mesh.getVertex(col[1])), p0)
        .cross(new THREE.Vector3().subVectors(V3(mesh.getVertex(col[2])), p0));
      mesh.faces.push(n.dot(ref) < 0 ? [...col].reverse() : col);
    }
  }

  // The original sharp loop is fully replaced. Anything still pointing at it is
  // re-pointed at the first ring rather than deleted — dropping the face would
  // punch a hole in the surface.
  const dead = new Set(originals);
  mesh.faces = mesh.faces.map((f) => {
    const out = [];
    for (const vid of f.map((x) => (dead.has(x) ? rings[0][idxOf.get(x)] : x))) {
      if (out.length === 0 || out[out.length - 1] !== vid) out.push(vid);
    }
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out;
  }).filter((f) => f.length >= 3);
  mesh.explicitEdges = mesh.explicitEdges.filter((e) => !dead.has(e.v1) && !dead.has(e.v2));
  // Hidden/visible edge bookkeeping must FOLLOW the re-pointing above, not be
  // dropped: an entry referencing a replaced loop vertex is remapped onto both
  // candidate rings (side A keeps rings[0], side B rings[segments]) so a
  // triangulation diagonal that touched the loop stays hidden after the bevel
  // instead of suddenly rendering as a stray diagonal line. Extra entries for
  // edges that don't exist are harmless.
  const remapEdgeList = (list) => {
    const out = [];
    for (const e of list || []) {
      const d1 = dead.has(e.v1), d2 = dead.has(e.v2);
      if (!d1 && !d2) { out.push(e); continue; }
      for (const ring of [rings[0], rings[segments]]) {
        const a = d1 ? ring[idxOf.get(e.v1)] : e.v1;
        const b = d2 ? ring[idxOf.get(e.v2)] : e.v2;
        if (a !== b && a != null && b != null) out.push({ ...e, v1: a, v2: b });
      }
    }
    return out;
  };
  mesh.hiddenEdges = remapEdgeList(mesh.hiddenEdges);
  mesh.visibleEdges = remapEdgeList(mesh.visibleEdges);
  mesh.vertices = mesh.vertices.filter((v) => !dead.has(v.id));

  // Smooth/soft normals is a single dedicated toggle (Soft/Hard normals) — a
  // shape tool must never flip it as a side effect.
  mesh.invalidateCache();
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
  sm.updateStats();
}