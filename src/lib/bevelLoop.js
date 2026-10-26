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

// Measure usable width from this particular loop vertex to the opposite
// boundary of its supporting polygon. A face-wide maximum cannot measure a
// taper: it reports the wide end even for vertices at the narrow end.
function vertexFaceReach(mesh, fi, vid, direction) {
  const face = mesh.faces[fi];
  if (!face?.includes(vid)) return Infinity;
  const origin = V3(mesh.getVertex(vid));
  const normal = mesh.getFaceNormal(fi);
  const cross = (a, b) => new THREE.Vector3().crossVectors(a, b).dot(normal);
  let closest = Infinity;
  // Traverse the coplanar surface, not just the triangle containing the
  // vertex. Internal triangulation edges are not geometric boundaries.
  const coplanarFaces = mesh.faces.filter((f, index) =>
    Math.abs(mesh.getFaceNormal(index).dot(normal)) > 0.9999 &&
    f.some((id) => Math.abs(normal.dot(V3(mesh.getVertex(id)).sub(origin))) < 1e-5));
  const counts = new Map();
  for (const f of coplanarFaces) for (let j = 0; j < f.length; j++) {
    const a = f[j], b = f[(j + 1) % f.length];
    const key = edgeKey(a, b);
    const item = counts.get(key);
    if (item) item.count++;
    else counts.set(key, { a, b, count: 1 });
  }
  for (const { a, b, count } of counts.values()) {
    if (count !== 1 || a === vid || b === vid) continue;
    const start = V3(mesh.getVertex(a)).sub(origin);
    const segment = V3(mesh.getVertex(b)).sub(V3(mesh.getVertex(a)));
    const denom = cross(direction, segment);
    if (Math.abs(denom) < 1e-10) continue;
    const distance = cross(start, segment) / denom;
    const fraction = cross(start, direction) / denom;
    if (distance > 1e-7 && fraction >= -1e-7 && fraction <= 1 + 1e-7)
      closest = Math.min(closest, distance);
  }
  return closest;
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
  // A circular fillet can be tangent to BOTH faces only when the two
  // setbacks are equal. Mitered loop endpoints may have different setbacks;
  // averaging their lengths and then interpolating radii produces a bulging,
  // non-circular strip. Use a quadratic tangent blend in that case, which
  // stays inside the corner and has the correct tangent at both ends.
  if (Math.abs(lA - lB) > Math.max(lA, lB) * 1e-4) {
    const tangentA = nA.clone().multiplyScalar(-1);
    const tangentB = nB.clone();
    const cross = (a, b) => new THREE.Vector3().crossVectors(a, b);
    const normal = cross(nA, nB);
    if (normal.lengthSq() < 1e-12) return (t) => pA.clone().lerp(pB, t);
    const chord = pB.clone().sub(pA);
    const denom = cross(tangentA, tangentB).dot(normal);
    if (Math.abs(denom) < 1e-12) return (t) => pA.clone().lerp(pB, t);
    const dist = cross(chord, tangentB).dot(normal) / denom;
    const control = pA.clone().addScaledVector(tangentA, dist);
    if (!Number.isFinite(dist)) return (t) => pA.clone().lerp(pB, t);
    return (t) => pA.clone().multiplyScalar((1-t)*(1-t))
      .addScaledVector(control, 2*t*(1-t)).addScaledVector(pB, t*t);
  }
  const s = lA / cosHalf;
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

// The standard round bevel profile used by other modeling programs: a quarter
// ellipse inside the parallelogram formed by the corner and the two offset
// points, tangent to both faces, sampled at equal angles. It cuts into the
// corner and stays within it, whatever the corner angle or the two widths.
export function bevelProfile(v, pA, pB) {
  const o = pA.clone().add(pB).sub(v);
  const a = pA.clone().sub(o), b = pB.clone().sub(o);
  return (t) => {
    const th = t * Math.PI / 2;
    return o.clone().addScaledVector(a, Math.cos(th)).addScaledVector(b, Math.sin(th));
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
  // A normal bevel takes the entered amount from each face, measured straight
  // out from the edge, the same as the bevel width in other modeling programs.
  // Never silently substitute a smaller bevel for the entered measurement.
  // A radius that cannot fit the adjacent faces is rejected rather than
  // producing a different-sized bevel without telling the user.
  // Do not reject a transverse tube bend based on the width of an
  // individual wall face. Its tangent points travel along the straight legs,
  // and may extend beyond the immediately adjacent polygon.
  const isTransverseBend = closed && perEdge.length > 2 &&
    perEdge.every((edge) => edge.dA && edge.dB);
  // Do not reject the entire selected chain because one narrow section has
  // less room than the requested setback. Each corner is resolved against its
  // own adjacent geometry below. The wide portions must remain editable.
  // (Straight transverse bends use their separate rigid-section sweep.)
  sm._bevelRadiusError = null;
  const r = requested;

  // Straight tube / prism legs. On a closed loop, each loop vertex is checked
  // for its own wall edge running down each leg; the walls all have to run in
  // one direction, so a tapered loop (cone, pyramid tip, chamfer) never
  // qualifies. Returns that leg's next ring of vertices and its axis.
  const loopVertexSet = new Set(order);
  const neighbors = new Map();
  for (const f of mesh.faces) {
    for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  }
  const straightLeg = (key) => {
    if (!closed) return null;
    let hint = new THREE.Vector3();
    for (const pe of perEdge) hint.add(pe[key]);
    if (hint.lengthSq() < 1e-12) return null;
    hint.normalize();
    // Pick each vertex's wall edge, then re-pick against the average of those
    // picks: on a triangulated wall a diagonal can look closer to the rough
    // first direction than the straight wall edge does.
    let ring = [], dirs = [];
    for (let pass = 0; pass < 3; pass++) {
      ring = []; dirs = [];
      for (let i = 0; i < N; i++) {
        const pv = V3(mesh.getVertex(order[i]));
        let best = null, bestDot = -Infinity, bestDir = null;
        for (const w of neighbors.get(order[i]) || []) {
          if (loopVertexSet.has(w)) continue;
          const d = V3(mesh.getVertex(w)).sub(pv);
          if (d.lengthSq() < 1e-14) continue;
          d.normalize();
          const dot = d.dot(hint);
          if (dot > bestDot) { bestDot = dot; best = w; bestDir = d; }
        }
        if (best == null || bestDot < 0.5) return null;
        ring.push(best);
        dirs.push(bestDir);
      }
      const next = new THREE.Vector3();
      for (const d of dirs) next.add(d);
      if (next.lengthSq() < 1e-12) return null;
      hint = next.normalize();
    }
    if (new Set(ring).size !== N) return null;
    for (let i = 0; i < N; i++) if (!neighbors.get(ring[i])?.has(ring[(i + 1) % N])) return null;
    for (const d of dirs) if (d.dot(hint) < 0.995) return null;
    return { ring, axis: hint };
  };
  // A normal (non-Sweep) bevel across a straight tube moves every loop vertex
  // straight along its leg, so the tube's cross-section stays its true size.
  // Offsetting along each wall facet's own direction pushed vertices sideways
  // and swelled the tube into a lumpy, oversized band.
  const rigidLegs = !sweep && closed ? { dA: straightLeg('dA'), dB: straightLeg('dB') } : null;
  const rigidAxis = (pick) => (rigidLegs?.dA && rigidLegs?.dB ? rigidLegs[pick].axis : null);

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

  // At the two ends of an open chain, the bevel's corners slide along the
  // face's own border edge leaving that end, so they stay on the surface.
  // Moving them straight out from the beveled edge left the face wherever
  // that border runs at an angle (a sloped top), pushing the corner above
  // the surface and raising the area around the bevel.
  const shownEdges = new Set(mesh.getEdges().map((e) => edgeKey(e.v1, e.v2)));
  const slideAlongEnd = (i, ei, pick, amount) => {
    const vid = order[i];
    const loopNeighbor = i === 0 ? order[1] : order[N - 2];
    const face = pick === 'dA' ? sides[ei].a : sides[ei].b;
    const normal = mesh.getFaceNormal(face);
    const pv = V3(mesh.getVertex(vid));
    const along = V3(mesh.getVertex(loopNeighbor)).sub(pv).normalize();
    const out = perEdge[ei][pick];
    // Prefer the actual boundary edge of the supporting side face at the
    // selected chain endpoint. Looking across every neighboring face could
    // pick a diagonal from the end cap instead, shifting the bevel off the
    // original cross-section at the wide/narrow tip.
    const supportFace = mesh.faces[face];
    const supportIndex = supportFace.indexOf(vid);
    if (supportIndex >= 0) {
      for (const w of [
        supportFace[(supportIndex + 1) % supportFace.length],
        supportFace[(supportIndex - 1 + supportFace.length) % supportFace.length],
      ]) {
        if (w === loopNeighbor || !shownEdges.has(edgeKey(vid, w))) continue;
        const d = V3(mesh.getVertex(w)).sub(pv);
        const len = d.length();
        if (len < 1e-9) continue;
        d.divideScalar(len);
        const lateral = d.dot(out);
        if (lateral <= 0.15) continue;
        const transverse = d.clone().sub(along.clone().multiplyScalar(d.dot(along))).length();
        const step = Math.min(amount / Math.max(1e-6, transverse), len * 0.9);
        return pv.clone().addScaledVector(d, step);
      }
    }
    let best = null, bestDot = 0.2;
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const f = mesh.faces[fi];
      const k = f.indexOf(vid);
      if (k < 0 || Math.abs(mesh.getFaceNormal(fi).dot(normal)) < 0.9995) continue;
      for (const w of [f[(k + 1) % f.length], f[(k - 1 + f.length) % f.length]]) {
        if (w === loopNeighbor || !shownEdges.has(edgeKey(vid, w))) continue;
        const d = V3(mesh.getVertex(w)).sub(pv);
        const len = d.length();
        if (len < 1e-9) continue;
        d.divideScalar(len);
        if (Math.abs(d.dot(normal)) > 0.01) continue;
        const sideways = d.dot(out); // how much of a step along the border moves away from the edge
        if (sideways > bestDot) { bestDot = sideways; best = { d, len }; }
      }
    }
    if (!best) return null;
    const transverse = best.d.clone().sub(along.clone().multiplyScalar(best.d.dot(along))).length();
    const step = Math.min(amount / Math.max(1e-6, transverse), best.len * 0.9);
    return pv.clone().addScaledVector(best.d, step);
  };

  // At an interior vertex of an open selected ridge, the two side polygons
  // often meet along a real transverse mesh edge (a spoke). The bevel rail
  // follows that spoke so every profile point stays on the model surface.
  // Returns { unit, length, alignment } for the spoke, or null.
  const spokeFor = (i, pick) => {
    const inc = at[i];
    if (closed || inc.length !== 2) return null;
    const vid = order[i];
    const f0 = pick === 'dA' ? sides[inc[0]].a : sides[inc[0]].b;
    const f1 = pick === 'dA' ? sides[inc[1]].a : sides[inc[1]].b;
    if (f0 === f1) return null;
    const vv = V3(mesh.getVertex(vid));
    const around = (fi) => {
      const f = mesh.faces[fi], k = f.indexOf(vid);
      return k < 0 ? [] : [f[(k + 1) % f.length], f[(k - 1 + f.length) % f.length]];
    };
    const shared = new Set(around(f1));
    let best = null, bestAlignment = 0.15;
    for (const w of around(f0)) {
      if (!shared.has(w) || !shownEdges.has(edgeKey(vid, w)) ||
          w === order[i - 1] || w === order[i + 1]) continue;
      const offset = V3(mesh.getVertex(w)).sub(vv);
      const length = offset.length();
      if (length < 1e-8) continue;
      const unit = offset.clone().divideScalar(length);
      const alignment = Math.min(...inc.map(ei => perEdge[ei][pick].dot(unit)));
      if (alignment > bestAlignment) {
        best = { unit, length, alignment };
        bestAlignment = alignment;
      }
    }
    return best;
  };

  // For a tapered open chain, compare the usable width at each vertex,
  // not the maximum width of an entire face. The latter can be dominated by
  // the opposite end of a taper and reverse the intended profile.
  const vertexWidths = order.map((vid, i) => {
    const inc = at[i];
    return ['dA', 'dB'].map((pick) => {
      // Where a spoke exists the usable width is the spoke itself. Ray-casting
      // along the face's perpendicular direction instead hits the face's own
      // top/bottom edge whenever the ridge is slanted, reporting a tiny width
      // and squeezing the bevel there while neighbouring stations stay wide.
      const spoke = spokeFor(i, pick);
      if (spoke) return spoke.length * spoke.alignment;
      let width = Infinity;
      for (const ei of inc) {
        const fi = pick === 'dA' ? sides[ei].a : sides[ei].b;
        const w = vertexFaceReach(mesh, fi, vid, perEdge[ei][pick]);
        if (Number.isFinite(w) && w > 1e-7) width = Math.min(width, w);
      }
      return width;
    });
  });
  const maxVertexWidth = [0, 0];
  if (!closed && N > 2 && !sweep) {
    for (const widths of vertexWidths) {
      for (let side = 0; side < 2; side++) {
        if (Number.isFinite(widths[side])) maxVertexWidth[side] = Math.max(maxVertexWidth[side], widths[side]);
      }
    }
  }

  for (let i = 0; i < N; i++) {
    const vid = order[i];
    const vv = V3(mesh.getVertex(vid));
    originals.push(vid);
    const inc = at[i];

    // At an interior vertex of an open selected ridge, the two side
    // polygons often meet along a real transverse mesh edge (a spoke).
    // Their separately calculated face-inward vectors are NOT coplanar on
    // a curved shoulder. Bisecting those vectors sends the bevel rail off
    // both supporting faces and produces the folded / pinched shoulder.
    // Follow the existing shared spoke instead so all profile vertices
    // remain on the actual model surface, even where the ridge curves.
    const sharedSpokePoint = (pick, amount) => {
      const best = spokeFor(i, pick);
      if (!best) return null;
      const step = Math.min(amount / best.alignment, best.length * 0.9);
      return vv.clone().addScaledVector(best.unit, step);
    };
    // Resolve setback locally. A global minimum across the entire chain
    // previously made the radius stop working as soon as one tapered portion
    // ran out of room, even though wider sections still had space.
    const localReach = (pick) => {
      // The rail runs along the spoke, so the spoke bounds the setback.
      const spoke = spokeFor(i, pick);
      if (spoke) return spoke.length * spoke.alignment * 0.9;
      let available = Infinity;
      for (const ei of inc) {
        const edge = walk[ei];
        const fi = pick === 'dA' ? sides[ei].a : sides[ei].b;
        const dir = perEdge[ei][pick];
        const localWidth = vertexFaceReach(mesh, fi, vid, dir);
        const width = Number.isFinite(localWidth) ? localWidth :
          reachAlong(mesh, fi, edge.v1, edge.v2, dir);
        if (width > 1e-8) available = Math.min(available, width * 0.9);
      }
      return available;
    };
    const localRadius = (pick) => {
      const available = localReach(pick);
      // A closed loop is not necessarily a straight tube: tapered and
      // irregular closed creases must still respect their local face widths.
      // Only a verified pair of rigid straight legs may bypass this limit.
      const isRigidTube = !!(rigidAxis('dA') && rigidAxis('dB'));
      const side = pick === 'dA' ? 0 : 1;
      const width = vertexWidths[i][side];
      if (maxVertexWidth[side] > 1e-7 && Number.isFinite(width)) {
        // Radius is the setback at the widest point of the chain. The
        // narrower end gets proportionally smaller segments.
        return Math.min(r * width / maxVertexWidth[side], available);
      }
      return !sweep && !isRigidTube && Number.isFinite(available)
        ? Math.min(r, available) : r;
    };
    const mitered = (pick) => {
      const amount = localRadius(pick);
      const rigid = rigidAxis(pick);
      if (rigid) return vv.clone().addScaledVector(rigid, amount);
      const spoke = sharedSpokePoint(pick, amount);
      if (spoke) return spoke;
      if (!closed && inc.length === 1) {
        const slid = slideAlongEnd(i, inc[0], pick, amount);
        if (slid) return slid;
      }
      const shared = pick === 'dA' ? sharedA : sharedB;
      if (shared) return vv.clone().addScaledVector(shared, amount);
      const dirs = inc.map((ei) => perEdge[ei][pick]);
      const bis = new THREE.Vector3();
      for (const d of dirs) bis.add(d);
      if (bis.lengthSq() < 1e-16) return vv.clone().addScaledVector(dirs[0], amount);
      bis.normalize();
      let cos = 1;
      for (const d of dirs) cos = Math.min(cos, bis.dot(d));
      // Follow the actual angle between adjoining face directions. A fixed
      // 0.74 denominator made tight corners arbitrarily narrow regardless of
      // the geometry, causing uneven bevel widths around irregular loops.
      // Reject a degenerate/reversed bisector rather than inventing a width.
      if (cos <= 1e-6) return vv.clone().addScaledVector(dirs[0], amount);
      // The miter amplifies setback by 1/cos at sharp changes in the
      // selected edge chain. Constrain the resulting travel, not merely
      // the unamplified setback: otherwise a broad radius makes the
      // shoulder vertices shoot past their neighboring surface boundary,
      // producing the pinched / crossing rails visible on tapered ends.
      const reach = localReach(pick);
      const len = Number.isFinite(reach)
        ? Math.min(amount / cos, reach)
        : amount / cos;
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
  let tubeSweep = sweep && closed
    ? createPipeBendSweep({
      perEdge,
      corners,
      radius: r,
      legA: legAxis(sides.map((s) => s.a)),
      legB: legAxis(sides.map((s) => s.b)),
    })
    : null;
  // A normal bevel across a bent tube rounds the bend the same way: the tube's
  // section is carried around the corner, starting the entered distance down
  // each leg. Moving every point along its own small arc instead kept the
  // stretched corner section all the way round, so the bend just got wider.
  if (!tubeSweep && rigidLegs?.dA && rigidLegs?.dB) {
    const legA = rigidLegs.dA.axis, legB = rigidLegs.dB.axis;
    const omega = Math.PI - Math.acos(THREE.MathUtils.clamp(legA.dot(legB), -1, 1));
    if (omega > 1e-3 && omega < Math.PI - 1e-3) {
      tubeSweep = createPipeBendSweep({ perEdge, corners, radius: r / Math.tan(omega / 2), legA, legB });
    }
  }

  // A Sweep's tangent points can reach past the next loop along a leg (a cut
  // loop close to the bend). The bend then overlapped that loop: faces folded
  // back through the tube and opened holes. A loop the bend passes is inside
  // the bend, so it is merged into the selected loop and the bend is rebuilt;
  // the leg beyond it is left where it was.
  const absorbDepth = options._absorbDepth || 0;
  if (tubeSweep && absorbDepth < 64) {
    for (const [key, t] of [['dA', 0], ['dB', 1]]) {
      const leg = straightLeg(key);
      if (!leg) continue;
      let passes = false;
      for (let i = 0; i < N && !passes; i++) {
        const pv = corners[i].vv;
        const end = tubeSweep(i, t);
        const reach = V3(mesh.getVertex(leg.ring[i])).sub(pv).dot(leg.axis);
        if (end && end.clone().sub(pv).dot(leg.axis) >= reach * 0.98) passes = true;
      }
      if (!passes) continue;
      const into = new Map(leg.ring.map((w, i) => [w, order[i]]));
      const remap = (id) => (into.has(id) ? into.get(id) : id);
      mesh.faces = mesh.faces.map((f) => {
        const out = [];
        for (const vid of f.map(remap)) if (out.length === 0 || out[out.length - 1] !== vid) out.push(vid);
        if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
        return out;
      }).filter((f) => new Set(f).size >= 3);
      const remapEdges = (list) => (list || [])
        .map((e) => ({ ...e, v1: remap(e.v1), v2: remap(e.v2) }))
        .filter((e) => e.v1 !== e.v2);
      // A hidden triangulation diagonal of the merged strip lands on a loop
      // edge; it must not hide the loop the bend is rebuilt from.
      const loopKeys = new Set(walk.map((e) => edgeKey(e.v1, e.v2)));
      mesh.explicitEdges = remapEdges(mesh.explicitEdges);
      mesh.hiddenEdges = remapEdges(mesh.hiddenEdges).filter((e) => !loopKeys.has(edgeKey(e.v1, e.v2)));
      mesh.visibleEdges = remapEdges(mesh.visibleEdges);
      mesh.vertices = mesh.vertices.filter((v) => !into.has(v.id));
      mesh.invalidateCache();
      sel.indices = mesh.getEdges().map((e, i) => (loopKeys.has(edgeKey(e.v1, e.v2)) ? i : -1)).filter((i) => i >= 0);
      bevelLoopEdges(sm, { ...options, _singleComponent: true, _absorbDepth: absorbDepth + 1 });
      return;
    }
  }

  for (let i = 0; i < N; i++) {
    const { vv, pA, pB } = corners[i];
    const sample = tubeSweep
      ? (t) => tubeSweep(i, t)
      // Every bevel rounds the corner; Segments sets how many steps the curve
      // has. A one-segment bevel is necessarily a single flat cut.
      : bevelProfile(vv, pA, pB);
    // On irregular closed loops, distribute segments by actual distance along
    // each corner's profile, not by one shared angle parameter. The previous
    // fixed-angle sampling gave visibly uniform angular slices even where the
    // adjacent face geometry changes dramatically around the loop.
    let parameters = null;
    if (closed && !tubeSweep && !rigidAxis('dA') && segments > 1) {
      const steps = Math.max(32, segments * 12);
      const lengths = [0];
      let previous = sample(0);
      for (let k = 1; k <= steps; k++) {
        const current = sample(k / steps);
        lengths.push(lengths[k - 1] + current.distanceTo(previous));
        previous = current;
      }
      const total = lengths[steps];
      if (total > 1e-9) {
        parameters = [0];
        for (let s = 1; s < segments; s++) {
          const target = total * s / segments;
          let k = 1;
          while (k < steps && lengths[k] < target) k++;
          const span = lengths[k] - lengths[k - 1];
          parameters.push((k - 1 + (span > 1e-12 ? (target - lengths[k - 1]) / span : 0)) / steps);
        }
        parameters.push(1);
      }
    }
    for (let s = 0; s <= segments; s++) {
      const p = sample(parameters ? parameters[s] : s / segments);
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
  // A cap at an open end whose triangles are NOT flat (a sloped or domed end)
  // must not be merged into one polygon: a bent polygon renders as a warped
  // surface that bulges up around the bevel. Instead the triangles keep their
  // shape: those on side A's half take ring 0, those on side B's half take the
  // last ring, and the one facing the bevel takes the arc, split back into
  // flat triangles.
  const capPlan = new Map(); // face index -> { ring } | { entry }
  const planBentCap = (i, fiset) => {
    const V = order[i];
    const endEdge = i === 0 ? 0 : walk.length - 1;
    const faceA = sides[endEdge].a, faceB = sides[endEdge].b;
    const loopNeighbor = i === 0 ? order[1] : order[N - 2];
    const nextAround = (fi, from) => {
      const f = mesh.faces[fi];
      const k = f.indexOf(V);
      if (k < 0) return null;
      const a = f[(k + 1) % f.length], b = f[(k - 1 + f.length) % f.length];
      return a === from ? b : a;
    };
    const ordered = [];
    let cur = faceA, from = loopNeighbor;
    for (let guard = 0; guard < 64; guard++) {
      const x = nextAround(cur, from);
      if (x == null) return false;
      const g = (edgeFaceMap.get(edgeKey(V, x)) || []).find((h) => h !== cur);
      if (g == null) return false;
      // Side faces that only touch the corner belong to their side: keep
      // walking past side A's, stop at side B's.
      if (g === faceB || (onB[g] && !fiset.has(g))) break;
      if (onA[g] && !fiset.has(g) && ordered.length === 0) { cur = g; from = x; continue; }
      if (!fiset.has(g)) return false;
      ordered.push({ fi: g, entry: x });
      cur = g; from = x;
    }
    if (ordered.length !== fiset.size) return false;
    const pv = P(V);
    const toward = P(rings[Math.floor(segments / 2)][i]).sub(pv);
    let h = 0, best = -Infinity;
    ordered.forEach((c, j) => {
      const d = mesh.getFaceCenter(c.fi).sub(pv);
      const score = d.lengthSq() > 1e-16 ? d.normalize().dot(toward.clone().normalize()) : -Infinity;
      if (score > best) { best = score; h = j; }
    });
    ordered.forEach((c, j) => capPlan.set(c.fi, j < h ? { ring: 0 } : j > h ? { ring: segments } : { entry: c.entry }));
    return true;
  };

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
      const capNormal = mesh.getFaceNormal([...fiset][0]);
      const bent = [...fiset].some((fi) => mesh.getFaceNormal(fi).dot(capNormal) < 0.9995);
      if (bent && planBentCap(i, fiset)) continue;
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

  const extraFaces = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    if (!f.some((vid) => idxOf.has(vid))) continue;
    const planned = capPlan.get(fi);
    if (planned) {
      const k = f.findIndex((vid) => idxOf.has(vid));
      const i = idxOf.get(f[k]);
      if (planned.ring != null) {
        mesh.faces[fi] = f.map((vid) => (idxOf.has(vid) ? rings[planned.ring][idxOf.get(vid)] : vid));
        continue;
      }
      const arc = [];
      for (let s = 0; s <= segments; s++) arc.push(rings[s][i]);
      if (f[(k - 1 + f.length) % f.length] !== planned.entry) arc.reverse();
      const poly = [...f.slice(0, k), ...arc, ...f.slice(k + 1)];
      // Fan the polygon from the corner farthest from the bevel so every
      // piece is a flat triangle; the fan lines stay hidden.
      const pv = P(order[i]);
      let apex = 0, far = -1;
      poly.forEach((vid, j) => {
        if (arc.includes(vid)) return;
        const d = P(vid).distanceToSquared(pv);
        if (d > far) { far = d; apex = j; }
      });
      const ring = [...poly.slice(apex), ...poly.slice(0, apex)];
      const tris = [];
      for (let j = 1; j < ring.length - 1; j++) tris.push([ring[0], ring[j], ring[j + 1]]);
      for (let j = 2; j < ring.length - 1; j++) mesh.hiddenEdges.push({ v1: ring[0], v2: ring[j], locked: true });
      mesh.faces[fi] = tris[0];
      extraFaces.push(...tris.slice(1));
      arcUsedAt.add(i);
      continue;
    }
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

  mesh.faces.push(...extraFaces);

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