import * as THREE from 'three';
import { clamp } from './utils';
import { newVid, edgeKey, posKey, adjacentFaceIndicesForEdge, weldCoincidentVertices } from './meshTopology';
import { orderLoop, classifySides, arcSampler } from './bevelLoop';

// CORNER RADIUS — bends a whole mesh section, it is NOT an edge bevel.
//
// The selected edge loop is treated as ONE transverse cross-section sitting at
// the sharp corner between two straight mesh sections. For every vertex of that
// loop we look up its longitudinal neighbours (the corresponding vertices in the
// neighbouring loop on each side), trim those two directions back by the tangent
// distance the requested radius needs, and sweep a circular arc between the two
// tangent points. Sampling every vertex's arc at the same parameter produces the
// intermediate cross-section loops, so the resulting topology is
//
//   straight section -> tangent loop -> N curved loops -> tangent loop -> straight
//
// Vertex ordering and the cross-section shape are preserved throughout: ring k
// vertex i always corresponds to loop vertex i, and every longitudinal vertex
// chain gets its own matching arc so each longitudinal edge follows the bend.

const V3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
const keyOf = posKey;

// vertex id -> set of vertex ids sharing an edge with it
function buildNeighbourMap(mesh) {
  const nbr = new Map();
  const add = (a, b) => {
    if (!nbr.has(a)) nbr.set(a, new Set());
    nbr.get(a).add(b);
  };
  for (const f of mesh.faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      add(a, b);
      add(b, a);
    }
  }
  for (const e of mesh.explicitEdges || []) { add(e.v1, e.v2); add(e.v2, e.v1); }
  return nbr;
}

// Average face normal of the faces touching `vid` — used only to orient the new
// quads consistently with the surrounding surface.
function vertexNormal(mesh, vid) {
  const n = new THREE.Vector3();
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (mesh.faces[fi].includes(vid)) n.add(mesh.getFaceNormal(fi));
  }
  return n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

export function cornerRadiusLoop(sm, options = {}) {
  const sel = sm.selection;
  if (!sel.meshId || sel.type !== 'edge' || sel.indices.length === 0) return;
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;

  let edges = mesh.getEdges();
  if (!edges) return;

  // Repair split topology first, then re-find the selected edges by position
  // (welding renumbers vertices, so the old indices no longer apply).
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

  const raw = sel.indices.map((i) => edges[i]).filter(Boolean).map((e) => ({ v1: e.v1, v2: e.v2 }));
  if (raw.length === 0) return;
  const chain = orderLoop(raw);
  if (!chain || chain.order.length < 2) return;
  const { order, closed } = chain;
  const N = order.length;

  const blocked = new Set(raw.map((e) => edgeKey(e.v1, e.v2)));
  const walk = [];
  for (let i = 0; i < (closed ? N : N - 1); i++) walk.push({ v1: order[i], v2: order[(i + 1) % N] });
  const classified = classifySides(mesh, walk, blocked);
  if (!classified) return;
  const { sides, region } = classified;

  // Which of the two straight sections a face belongs to.
  const sideAFaces = new Set(sides.map((s) => s.a));
  const inSideA = (fi) => (region ? region.has(fi) : sideAFaces.has(fi));

  const segments = clamp(Math.round(options.segments || 6), 1, 48);
  const R = Math.max(0.001, Number(options.radius) || 0.1);

  const nbr = buildNeighbourMap(mesh);
  const loopSet = new Set(order);

  const rings = [];
  for (let s = 0; s <= segments; s++) rings.push(new Array(N));
  const samplers = new Array(N);
  const vertRef = new Array(N);

  for (let i = 0; i < N; i++) {
    const vid = order[i];
    const vv = V3(mesh.getVertex(vid));
    vertRef[i] = vertexNormal(mesh, vid);

    // Longitudinal neighbours, split by which straight section they lie in.
    const inA = [], inB = [];
    for (const n of nbr.get(vid) || []) {
      if (loopSet.has(n)) continue; // transverse (within the loop) — not longitudinal
      const faces = adjacentFaceIndicesForEdge(mesh, vid, n);
      if (faces.length === 0) continue;
      const allA = faces.every((fi) => inSideA(fi));
      const noneA = faces.every((fi) => !inSideA(fi));
      if (!allA && !noneA) continue; // straddles both sections — ambiguous
      const d = V3(mesh.getVertex(n)).sub(vv);
      const len = d.length();
      if (len < 1e-9) continue;
      (allA ? inA : inB).push({ dir: d.divideScalar(len), len });
    }
    // A corner needs an incoming AND an outgoing direction on this vertex.
    if (inA.length === 0 || inB.length === 0) return;

    const average = (list) => {
      const v = new THREE.Vector3();
      for (const e of list) v.add(e.dir);
      return v.lengthSq() < 1e-12 ? null : v.normalize();
    };
    const dA = average(inA), dB = average(inB);
    if (!dA || !dB) return;

    // Tangent distance for the requested radius: T = R / tan(theta/2), where
    // theta is the angle between the incoming and outgoing directions. Trimmed
    // so the arc never reaches past the neighbouring loop on either side.
    const theta = Math.acos(clamp(dA.dot(dB), -1, 1));
    const nearestA = Math.min(...inA.map((e) => e.len));
    const nearestB = Math.min(...inB.map((e) => e.len));
    const T = Math.min(R / Math.max(1e-3, Math.tan(theta / 2)), nearestA * 0.9, nearestB * 0.9);

    const pA = vv.clone().addScaledVector(dA, T);
    const pB = vv.clone().addScaledVector(dB, T);
    // Circular arc between the two tangent points — never a linear blend.
    samplers[i] = arcSampler(vv, pA, pB);
  }

  // Tangent loops (s = 0 and s = segments) plus the intermediate curved loops.
  const originals = [...order];
  for (let i = 0; i < N; i++) {
    for (let s = 0; s <= segments; s++) {
      const p = samplers[i](s / segments);
      const nv = { id: newVid(), x: p.x, y: p.y, z: p.z };
      mesh.vertices.push(nv);
      rings[s][i] = nv.id;
    }
  }

  // Each straight section reconnects to its own tangent loop, so the original
  // geometry either side of the bend is untouched apart from its end loop.
  const idxOf = new Map(order.map((vid, i) => [vid, i]));
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (!mesh.faces[fi].some((vid) => idxOf.has(vid))) continue;
    const ring = inSideA(fi) ? rings[0] : rings[segments];
    mesh.faces[fi] = mesh.faces[fi].map((vid) => (idxOf.has(vid) ? ring[idxOf.get(vid)] : vid));
  }

  // Rebuild the bend surface: corresponding vertices of consecutive loops.
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
      const ref = vertRef[i].clone().add(vertRef[j]);
      if (ref.lengthSq() < 1e-12) ref.copy(vertRef[i]);
      else ref.normalize();
      addQuad(rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i], ref);
    }
  }

  // Open cross-section: close the two exposed sides of the bend.
  if (!closed) {
    for (const i of [0, N - 1]) {
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

  // The original sharp cross-section is fully replaced by the two tangent loops.
  const dead = new Set(originals);
  mesh.faces = mesh.faces.map((f) => {
    const out = [];
    for (const vid of f.map((x) => (dead.has(x) ? rings[0][idxOf.get(x)] : x))) {
      if (out.length === 0 || out[out.length - 1] !== vid) out.push(vid);
    }
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out;
  }).filter((f) => f.length >= 3);

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
  mesh.explicitEdges = (mesh.explicitEdges || []).filter((e) => !dead.has(e.v1) && !dead.has(e.v2));
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