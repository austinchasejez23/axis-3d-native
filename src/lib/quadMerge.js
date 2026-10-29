// Merging triangle pairs into real single faces.
//
// A quad is often stored as two triangles joined by a "hidden diagonal": the
// line is hidden from the wireframe but the two halves stay separate faces, so
// tools see two triangles where the user sees one face. These helpers remove
// the diagonal for good and merge the halves into one face.
//
//  - mergeHiddenDiagonals: merges every edge the mesh already treats as a
//    hidden triangulation diagonal (new primitives, older saved models).
//  - reconstructImportedQuads: rebuilds the original quad grid of an imported
//    triangle mesh by pairing triangles globally, so each triangle belongs to
//    at most one quad and real grid lines are never swallowed by a diagonal.
import { edgeKey } from './meshTopology';
import { isSimplePolygon } from './meshTopologyInvariants';

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const len = (u) => Math.hypot(u[0], u[1], u[2]);
const DEG = 180 / Math.PI;

// Newell normal (unnormalised, length = 2 x area) of a vertex-id loop.
function newell(V, ids) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = V(ids[i]), q = V(ids[(i + 1) % ids.length]);
    if (!p || !q) return null;
    x += (p.y - q.y) * (p.z + q.z);
    y += (p.z - q.z) * (p.x + q.x);
    z += (p.x - q.x) * (p.y + q.y);
  }
  return [x, y, z];
}

function buildEdgeMap(faces) {
  const map = new Map();
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    for (let i = 0; i < f.length; i++) {
      const key = edgeKey(f[i], f[(i + 1) % f.length]);
      const list = map.get(key);
      if (list) list.push(fi); else map.set(key, [fi]);
    }
  }
  return map;
}

// Outline + checks for one set of triangles that become a single face.
// Returns null when the set cannot safely be one face.
function planGroup(mesh, V, members, { minAlign: required = 0.2 } = {}) {
  const faces = mesh.faces;
  const directed = new Set();
  for (const fi of members) {
    const f = faces[fi];
    if (f.length !== 3) return null;
    for (let i = 0; i < 3; i++) {
      const k = `${f[i]}>${f[(i + 1) % 3]}`;
      // The same direction twice means two neighbours wound against each other.
      if (directed.has(k)) return null;
      directed.add(k);
    }
  }
  // Halves painted different colours must not be forced into one colour.
  const colors = members.map((fi) => mesh.faceColors?.[fi]);
  if (colors.some((c) => c !== colors[0])) return null;
  const out = new Map();
  const internal = [];
  let count = 0;
  for (const fi of members) {
    const f = faces[fi];
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      if (directed.has(`${b}>${a}`)) { internal.push([fi, a, b]); continue; }
      if (out.has(a)) return null;
      out.set(a, b);
      count++;
    }
  }
  if (count < 3 || !internal.length) return null;

  // Start the outline at a vertex shared by every triangle (fan apex, or the
  // first end of a pair's diagonal) so a plain fan from the first corner
  // reproduces the original triangles without storing them.
  let common = null;
  for (const fi of members) {
    const ids = new Set(faces[fi]);
    common = common ? new Set([...common].filter((id) => ids.has(id))) : ids;
  }
  let start;
  if (common && common.size) {
    if (members.length === 2) start = internal.find(([, a]) => common.has(a))?.[1];
    else start = [...common][0];
  }
  if (start == null || !out.has(start)) start = out.keys().next().value;

  const poly = [start];
  let cur = out.get(start);
  while (cur !== start) {
    if (cur === undefined || poly.length > count) return null;
    poly.push(cur);
    cur = out.get(cur);
  }
  if (poly.length !== count || poly.length !== members.length + 2) return null;
  const onBoundary = new Set(poly);
  for (const fi of members) for (const id of faces[fi]) if (!onBoundary.has(id)) return null;

  const nPoly = newell(V, poly);
  if (!nPoly) return null;
  const lp = len(nPoly);
  if (lp < 1e-18) return null;
  const unit = [nPoly[0] / lp, nPoly[1] / lp, nPoly[2] / lp];
  let minAlign = 1;
  for (const fi of members) {
    const nm = newell(V, faces[fi]);
    if (!nm) return null;
    const lm = len(nm);
    if (lm < 1e-18) return null;
    const align = dot(nm, unit) / lm;
    if (align <= required) return null;
    minAlign = Math.min(minAlign, align);
  }
  // Can the plain fan from the first corner draw the face exactly?
  const p0 = V(poly[0]);
  let fanValid = true;
  for (let i = 1; i < poly.length - 1 && fanValid; i++) {
    const a = V(poly[i]), b = V(poly[i + 1]);
    const area = dot(cross(sub(a, p0), sub(b, p0)), unit);
    if (!(area > lp * 1e-6)) fanValid = false;
  }
  const store = !fanValid || minAlign < 0.9;
  if (!fanValid && minAlign >= 0.9995 && !isSimplePolygon(mesh, poly, { x: unit[0], y: unit[1], z: unit[2] })) return null;
  const internalKeys = internal.map(([, a, b]) => edgeKey(a, b));
  return { members, poly, store, tris: store ? members.map((fi) => [...faces[fi]]) : null, internalKeys };
}

function applyGroups(mesh, plans) {
  if (!plans.length) return 0;
  const faces = mesh.faces;
  const replaceAt = new Map();
  const drop = new Set();
  const removedKeys = new Set();
  for (const plan of plans) {
    const sorted = [...plan.members].sort((a, b) => a - b);
    replaceAt.set(sorted[0], { plan, sorted });
    for (let k = 1; k < sorted.length; k++) drop.add(sorted[k]);
    for (const key of plan.internalKeys) removedKeys.add(key);
  }
  const newFaces = [];
  const newColors = {};
  const newTris = {};
  for (let fi = 0; fi < faces.length; fi++) {
    if (drop.has(fi)) continue;
    const ni = newFaces.length;
    const hit = replaceAt.get(fi);
    if (hit) {
      newFaces.push(hit.plan.poly);
      const colorSource = hit.sorted.find((m) => mesh.faceColors?.[m] != null);
      if (colorSource != null) newColors[ni] = mesh.faceColors[colorSource];
      if (hit.plan.store) newTris[ni] = hit.plan.tris;
    } else {
      newFaces.push(faces[fi]);
      if (mesh.faceColors?.[fi] != null) newColors[ni] = mesh.faceColors[fi];
      const stored = mesh.faceRenderTriangles?.[fi];
      if (stored?.length) newTris[ni] = stored;
    }
  }
  mesh.faces = newFaces;
  mesh.faceColors = newColors;
  mesh.faceRenderTriangles = newTris;
  mesh.hiddenEdges = (mesh.hiddenEdges || []).filter((e) => !removedKeys.has(edgeKey(e.v1, e.v2)));
  mesh.visibleEdges = (mesh.visibleEdges || []).filter((e) => !removedKeys.has(edgeKey(e.v1, e.v2)));
  mesh.invalidateCache();
  return plans.length;
}

function planAll(mesh, groupsOfFaces) {
  const V = (id) => mesh.getVertex(id);
  const plans = [];
  for (const members of groupsOfFaces) {
    const plan = planGroup(mesh, V, members);
    if (plan) plans.push(plan);
  }
  return plans;
}

// Merge every hidden triangulation diagonal into a single face.
//  classify: also judge edges the mesh has never classified yet (a fresh
//  primitive); otherwise only edges already recorded as hidden are merged.
export function mergeHiddenDiagonals(mesh, { classify = false } = {}) {
  const faces = mesh.faces;
  if (!faces.length) return 0;
  const edgeMap = buildEdgeMap(faces);
  const explicit = new Set((mesh.explicitEdges || []).map((e) => edgeKey(e.v1, e.v2)));
  const visible = mesh._visibleEdgeSet();
  const seen = new Set();
  const pairs = [];
  const take = (key, list) => {
    if (!list || list.length !== 2 || seen.has(key)) return false;
    if (faces[list[0]].length !== 3 || faces[list[1]].length !== 3) return false;
    seen.add(key);
    pairs.push(list);
    return true;
  };
  for (const h of mesh.hiddenEdges || []) {
    if (h.user) continue;
    const key = edgeKey(h.v1, h.v2);
    if (explicit.has(key)) continue;
    take(key, edgeMap.get(key));
  }
  if (classify) {
    for (const [key, list] of edgeMap) {
      if (list.length !== 2 || seen.has(key) || visible.has(key) || explicit.has(key)) continue;
      if (faces[list[0]].length !== 3 || faces[list[1]].length !== 3) continue;
      const [v1, v2] = key.split(',').map(Number);
      if (mesh.edgeIsTriangulationDiagonal(v1, v2, list[0], list[1])) take(key, list);
    }
  }
  if (!pairs.length) return 0;

  // Triangles joined through hidden edges form one group (a pair, or a fan).
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(a) !== r) { const next = parent.get(a); parent.set(a, r); a = next; }
    return r;
  };
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const fi of parent.keys()) {
    const r = find(fi);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(fi);
  }
  const ordered = [...groups.values()].map((g) => g.sort((a, b) => a - b));
  return applyGroups(mesh, planAll(mesh, ordered));
}

// How "quad shaped" two triangles are once joined across their shared edge.
function quadMetrics(V, quad, ni, nj) {
  const P = quad.map(V);
  if (P.some((p) => !p)) return null;
  const nrm = newell(V, quad);
  const ln = len(nrm);
  if (ln < 1e-18) return null;
  const unit = [nrm[0] / ln, nrm[1] / ln, nrm[2] / ln];
  let maxDev = 0, sumDev = 0;
  for (let k = 0; k < 4; k++) {
    const prev = P[(k + 3) % 4], cur = P[k], next = P[(k + 1) % 4];
    const e1 = sub(cur, prev), e2 = sub(next, cur);
    const l1 = len(e1), l2 = len(e2);
    if (l1 < 1e-12 || l2 < 1e-12) return null;
    // Every corner must turn the same way: a convex quad.
    if (!(dot(cross(e1, e2), unit) > 1e-9 * l1 * l2)) return null;
    const u = sub(prev, cur), v = sub(next, cur);
    const c = Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))));
    const dev = Math.abs(Math.acos(c) * DEG - 90);
    maxDev = Math.max(maxDev, dev);
    sumDev += dev;
  }
  const lni = len(ni), lnj = len(nj);
  if (lni < 1e-18 || lnj < 1e-18) return null;
  const twist = Math.acos(Math.max(-1, Math.min(1, dot(ni, nj) / (lni * lnj)))) * DEG;
  return { maxDev, meanDev: sumDev / 4, twist };
}

// Evidence ladder, strongest first. A pair earns the first tier it satisfies.
//  fan   - consecutive triangles written like a fanned polygon (v0,v1,v2),
//          (v0,v2,v3): how OBJ / FBX / glTF store a quad. Loose shape limits.
//  shape - any neighbours, but they must form a near-rectangular quad.
// Sequence reading (see reconstructImportedQuads): exporters write each quad as
// two consecutive triangles but may rotate their corners, so no fan pattern
// shows. A pair of consecutive triangles that already looks like a clean quad
// (SEQ_STRONG) is the evidence; when a mesh has enough of those
// (SEQ_EVIDENCE of its triangles) it was written from quads and looser pairs
// (SEQ_LOOSE) are believable too. SEQ_UNPAIRED weighs a lone triangle against
// the shape cost of a pair when two readings compete.
const SEQ_STRONG = { maxDev: 15, twist: 10 };
const SEQ_LOOSE = { maxDev: 60, twist: 40 };
const SEQ_EVIDENCE = 0.12;
const SEQ_UNPAIRED = 50;
const TIERS = [
  { maxDev: 55, maxTwist: 35 },
  { maxDev: 22, maxTwist: 20 },
];

// Pair the triangles of an imported mesh back into the quads they came from.
//  trustOrder - triangle order is meaningful (OBJ, FBX, glTF): consecutive
//  triangles that form a fan pattern are almost certainly one source quad.
//  STL and 3MF carry no such evidence and are paired by shape alone.
export function reconstructImportedQuads(mesh, { trustOrder = false } = {}) {
  mesh.importedQuadsMerged = true;
  const faces = mesh.faces;
  const total = faces.length;
  if (total < 2) return 0;
  const V = (id) => mesh.getVertex(id);
  const used = new Uint8Array(total);
  const groups = [];

  // The quad the two triangles i and j make across their shared edge.
  const pairMetrics = (i, j) => {
    const fi = faces[i], fj = faces[j];
    if (fi.length !== 3 || fj.length !== 3) return null;
    for (let p = 0; p < 3; p++) {
      const x = fi[p], y = fi[(p + 1) % 3], c = fi[(p + 2) % 3];
      for (let q = 0; q < 3; q++) {
        if (fj[q] !== y || fj[(q + 1) % 3] !== x) continue;
        const d = fj[(q + 2) % 3];
        if (d === c) return null;
        const ni = newell(V, fi), nj = newell(V, fj);
        if (!ni || !nj) return null;
        return quadMetrics(V, [x, d, y, c], ni, nj);
      }
    }
    return null;
  };

  // Triangle order evidence: exporters write each quad as two consecutive
  // triangles, but may rotate their corners (a "beauty" split), so no fan
  // pattern shows. Read the file as a sequence: every triangle is either alone
  // or paired with the next one, and keep the reading whose pairs look most
  // like real quads (best total of pair benefit, a lone triangle costs
  // SEQ_UNPAIRED). Only pairs within `lim` are considered.
  const sequencePairs = (lim, blocked) => {
    const pm = new Array(total).fill(null);
    for (let i = 0; i < total - 1; i++) {
      if (used[i] || used[i + 1] || (blocked && (blocked[i] || blocked[i + 1]))) continue;
      const m = pairMetrics(i, i + 1);
      if (m && m.maxDev <= lim.maxDev && m.twist <= lim.twist) pm[i] = m;
    }
    const gain = new Float64Array(total + 2);
    const take = new Uint8Array(total + 2);
    for (let i = total - 2; i >= 0; i--) {
      gain[i] = gain[i + 1];
      const m = pm[i];
      if (!m) continue;
      const g = 2 * SEQ_UNPAIRED - (m.maxDev + m.twist) + gain[i + 2];
      if (g > gain[i]) { gain[i] = g; take[i] = 1; }
    }
    let n = 0;
    for (let i = 0; i < total - 1;) {
      if (take[i]) { used[i] = 1; used[i + 1] = 1; groups.push([i, i + 1]); n++; i += 2; } else i++;
    }
    return n;
  };

  // Pairs that already look like clean quads come first: they decide what is a
  // grid, so nothing below can swallow a real grid line.
  const clean = trustOrder ? sequencePairs(SEQ_STRONG, null) : 0;

  // Runs of 3+ fan-linked triangles are a polygon with 5+ sides (a cap), not
  // quads. Leave those alone unless they pair up as real rectangles.
  const inLongFan = new Uint8Array(total);
  const fanRuns = [];
  if (trustOrder) {
    const linked = (i) => {
      const a = faces[i], b = faces[i + 1];
      return !used[i] && !used[i + 1] && a.length === 3 && b.length === 3 && b[0] === a[0] && b[1] === a[2];
    };
    let i = 0;
    while (i < total - 1) {
      if (!linked(i)) { i++; continue; }
      let j = i;
      while (j < total - 1 && linked(j)) j++;
      if (j - i + 1 >= 3) {
        for (let k = i; k <= j; k++) inLongFan[k] = 1;
        fanRuns.push([i, j]);
      }
      i = j + 1;
    }
  }

  // A flat run of fanned triangles is one polygon that was split for drawing
  // (a cylinder cap): put it back together. Anything curved or enclosing its
  // own centre point (a cone side, a cap with a hub vertex) stays as it is.
  const chainPlans = [];
  for (const [first, last] of fanRuns) {
    const members = [];
    for (let k = first; k <= last; k++) members.push(k);
    const plan = planGroup(mesh, V, members, { minAlign: 0.9986 });
    if (!plan || plan.store) continue;
    chainPlans.push(plan);
    for (const k of members) used[k] = 1;
  }

  // A file written from quads shows many near-rectangular consecutive pairs; a
  // triangle-native one almost none. Only then are looser pairs believable.
  if (trustOrder && clean * 2 >= total * SEQ_EVIDENCE) sequencePairs(SEQ_LOOSE, inLongFan);

  const edgeMap = buildEdgeMap(faces);
  const explicit = new Set((mesh.explicitEdges || []).map((e) => edgeKey(e.v1, e.v2)));
  const candidates = [];
  for (const [key, list] of edgeMap) {
    if (list.length !== 2 || explicit.has(key)) continue;
    if (used[list[0]] || used[list[1]]) continue;
    const i = list[0], j = list[1];
    const fi = faces[i], fj = faces[j];
    if (fi.length !== 3 || fj.length !== 3) continue;
    let p = -1;
    for (let k = 0; k < 3; k++) if (edgeKey(fi[k], fi[(k + 1) % 3]) === key) { p = k; break; }
    if (p < 0) continue;
    const x = fi[p], y = fi[(p + 1) % 3], c = fi[(p + 2) % 3];
    let q = -1;
    for (let k = 0; k < 3; k++) if (fj[k] === y && fj[(k + 1) % 3] === x) { q = k; break; }
    if (q < 0) continue; // neighbours wound against each other
    const d = fj[(q + 2) % 3];
    if (d === c) continue;
    const ni = newell(V, fi), nj = newell(V, fj);
    if (!ni || !nj) continue;
    const m = quadMetrics(V, [x, d, y, c], ni, nj);
    if (!m) continue;
    const consecutive = trustOrder && j === i + 1;
    const fanLike = consecutive && fj[0] === fi[0] && fj[1] === fi[2] && !inLongFan[i] && !inLongFan[j];
    for (let t = 0; t < TIERS.length; t++) {
      if (t === 0 && !fanLike) continue;
      if (m.maxDev <= TIERS[t].maxDev && m.twist <= TIERS[t].maxTwist) {
        candidates.push({ i, j, tier: t, maxDev: m.maxDev, score: m.meanDev + 0.5 * m.twist });
        break;
      }
    }
  }
  candidates.sort((a, b) => a.tier - b.tier || a.score - b.score);
  // Shape-only pairing is risky on genuine triangle meshes (a 72 degree corner
  // looks "square enough"). Allow it loosely only when the file's own triangle
  // order has already shown it was written from quads.
  let shapeLimit = null;
  for (const c of candidates) {
    if (used[c.i] || used[c.j]) continue;
    if (c.tier === 1) {
      if (shapeLimit === null) shapeLimit = groups.length * 2 >= total * 0.2 ? TIERS[1].maxDev : 12;
      if (c.maxDev > shapeLimit) continue;
    }
    used[c.i] = 1;
    used[c.j] = 1;
    groups.push([c.i, c.j]);
  }
  // Whatever is still a lone triangle may be part of a flat polygon that the
  // source triangulated for storage (a cap, a CAD face): coplanar neighbours
  // that enclose no vertex of their own are one face. Runs after the quad
  // pairing, so a flat ladder of quads has already become quads.
  const pairPlans = planAll(mesh, groups);
  const flatPlans = flatPolygonPlans(mesh, V, faces, used, edgeMap);
  return applyGroups(mesh, [...chainPlans, ...pairPlans, ...flatPlans]);
}

const FLAT_JOIN = 0.9998;   // neighbours within ~1 degree are the same plane
const FLAT_FACE = 0.9986;   // every triangle within ~3 degrees of the outline's plane
const FLAT_MAX = 4000;      // triangles in one polygon

function flatPolygonPlans(mesh, V, faces, used, edgeMap) {
  const total = faces.length;
  const parent = new Int32Array(total).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const normals = new Array(total).fill(undefined);
  const unit = (i) => {
    if (normals[i] !== undefined) return normals[i];
    const n = newell(V, faces[i]);
    const l = n ? len(n) : 0;
    return (normals[i] = l > 1e-18 ? [n[0] / l, n[1] / l, n[2] / l] : null);
  };
  const explicit = new Set((mesh.explicitEdges || []).map((e) => edgeKey(e.v1, e.v2)));
  for (const [key, list] of edgeMap) {
    if (list.length !== 2 || explicit.has(key)) continue;
    const [i, j] = list;
    if (used[i] || used[j] || faces[i].length !== 3 || faces[j].length !== 3) continue;
    const ni = unit(i), nj = unit(j);
    if (!ni || !nj || dot(ni, nj) < FLAT_JOIN) continue;
    parent[find(i)] = find(j);
  }
  const comps = new Map();
  for (let i = 0; i < total; i++) {
    if (used[i] || faces[i].length !== 3) continue;
    const r = find(i);
    const list = comps.get(r);
    if (list) list.push(i); else comps.set(r, [i]);
  }
  const plans = [];
  for (const members of comps.values()) {
    if (members.length < 2 || members.length > FLAT_MAX) continue;
    const plan = planGroup(mesh, V, members, { minAlign: FLAT_FACE });
    if (plan) plans.push(plan);
  }
  return plans;
}
