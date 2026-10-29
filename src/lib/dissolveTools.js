// Dissolve: remove faces' dividing edges / vertices and heal the surface by
// merging the faces around them into one, instead of leaving holes.
//   face   — 2+ selected faces that touch along an edge become ONE face
//   edge   — the two faces on each selected edge become one face
//   vertex — the faces around each selected vertex become one face
import { cleanupCommittedTopology } from './meshTopologyInvariants';
import { edgeKey } from './meshTopology';
import {
  visualFaceGroups, mergeLoop, checkPolygon, preservedTriangles, replaceFaces,
  firstColor, hasFaceWithSameCorners,
} from './faceMerge';

// A dissolved edge leaves its end points with two edges. Points that now sit on
// a straight line are removed; corners that still turn are kept.
const STRAIGHT = -0.99995;

// How many VISIBLE faces a face selection covers (a cube side stored as two
// triangles counts once).
export function countVisualFaces(mesh, indices) {
  if (!mesh || !indices?.length) return 0;
  const { groupOf } = visualFaceGroups(mesh);
  return new Set(indices.filter((i) => i >= 0 && i < mesh.faces.length).map((i) => groupOf[i])).size;
}

function unionFind() {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(a) !== r) { const next = parent.get(a); parent.set(a, r); a = next; }
    return r;
  };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  const components = () => {
    const out = new Map();
    for (const key of parent.keys()) {
      const r = find(key);
      if (out.has(r)) out.get(r).push(key); else out.set(r, [key]);
    }
    return [...out.values()].filter((list) => list.length > 1);
  };
  return { find, union, components };
}

// Merge every component (a list of visible-face groups) into one polygon.
function mergeComponents(mesh, groups, components) {
  const removed = new Set();
  const adds = [];
  for (const component of components) {
    const members = component.flatMap((root) => groups.get(root));
    const merged = mergeLoop(mesh, members);
    if (!merged) continue;
    const check = checkPolygon(mesh, merged.loop);
    if (!check.ok) continue;
    if (hasFaceWithSameCorners(mesh, merged.loop, new Set(members))) continue;
    members.forEach((fi) => removed.add(fi));
    adds.push({
      poly: merged.loop,
      color: firstColor(mesh, members),
      tris: check.planar ? null : preservedTriangles(mesh, members, merged.loop),
    });
  }
  if (!adds.length) return [];
  const indices = replaceFaces(mesh, removed, adds);
  return adds.map((add, i) => ({ index: indices[i], poly: add.poly }));
}

// Remove vertices that only join two straight edges.
function removeStraightPoints(mesh, candidates) {
  let removed = 0;
  for (const vid of candidates) {
    const touching = mesh._ensureVertexFaceMap().get(vid);
    if (!touching?.length || !mesh.getVertex(vid)) continue;
    if (touching.some((fi) => mesh.faces[fi].length <= 3)) continue;
    const around = new Set();
    for (const fi of touching) {
      const f = mesh.faces[fi];
      const at = f.indexOf(vid);
      around.add(f[(at + f.length - 1) % f.length]);
      around.add(f[(at + 1) % f.length]);
    }
    if (around.size !== 2) continue;
    const [a, b] = [...around].map((id) => mesh.getVertex(id));
    const v = mesh.getVertex(vid);
    const ux = a.x - v.x, uy = a.y - v.y, uz = a.z - v.z;
    const wx = b.x - v.x, wy = b.y - v.y, wz = b.z - v.z;
    const lu = Math.hypot(ux, uy, uz), lw = Math.hypot(wx, wy, wz);
    if (lu < 1e-12 || lw < 1e-12) continue;
    if ((ux * wx + uy * wy + uz * wz) / (lu * lw) > STRAIGHT) continue;
    for (const fi of touching) mesh.faces[fi] = mesh.faces[fi].filter((id) => id !== vid);
    mesh.invalidateCache();
    removed++;
  }
  return removed;
}

function dissolveFaces(mesh, indices) {
  const { groupOf, groups } = visualFaceGroups(mesh);
  const picked = new Set(indices.filter((i) => i >= 0 && i < mesh.faces.length).map((i) => groupOf[i]));
  if (picked.size < 2) return { notice: 'Select two or more faces to dissolve' };
  const uf = unionFind();
  let touching = false;
  for (const entry of mesh._ensureEdgeFaceMap().values()) {
    if (entry.faces.length !== 2) continue;
    const a = groupOf[entry.faces[0]], b = groupOf[entry.faces[1]];
    if (a === b || !picked.has(a) || !picked.has(b)) continue;
    uf.union(a, b);
    touching = true;
  }
  if (!touching) return { notice: 'Selected faces must share an edge to dissolve' };
  const merged = mergeComponents(mesh, groups, uf.components());
  if (!merged.length) return { notice: "Those faces can't be merged into one face" };
  return { changed: true, merged };
}

function dissolveEdges(mesh, indices) {
  const edges = mesh.getEdges();
  const { groupOf, groups } = visualFaceGroups(mesh);
  const map = mesh._ensureEdgeFaceMap();
  const uf = unionFind();
  const ends = new Set();
  for (const i of indices) {
    const e = edges[i];
    const entry = e && map.get(edgeKey(e.v1, e.v2));
    if (!entry || entry.faces.length !== 2) continue;
    const a = groupOf[entry.faces[0]], b = groupOf[entry.faces[1]];
    if (a === b) continue;
    uf.union(a, b);
    ends.add(e.v1); ends.add(e.v2);
  }
  const components = uf.components();
  if (!components.length) return { notice: 'Select an edge shared by two faces to dissolve' };
  const merged = mergeComponents(mesh, groups, components);
  if (!merged.length) return { notice: "Those edges can't be dissolved" };
  removeStraightPoints(mesh, ends);
  return { changed: true, merged };
}

// Dissolve one vertex. Returns true when the mesh changed.
function dissolveVertex(mesh, vid) {
  const touching = mesh._ensureVertexFaceMap().get(vid);
  if (!touching?.length) return false;
  const { groupOf, groups } = visualFaceGroups(mesh);
  const roots = [...new Set(touching.map((fi) => groupOf[fi]))];
  const neighbours = new Set();
  for (const e of mesh.getEdges()) {
    if (e.v1 === vid) neighbours.add(e.v2);
    else if (e.v2 === vid) neighbours.add(e.v1);
  }
  if (neighbours.size < 2) return false;
  const members = roots.flatMap((root) => groups.get(root));
  const removed = new Set(members);
  const adds = [];
  if (neighbours.size === 2) {
    // Only joins two edges: every face around it just loses this corner.
    for (const root of roots) {
      const own = groups.get(root);
      let loop;
      if (own.length === 1) loop = [...mesh.faces[own[0]]];
      else {
        const merged = mergeLoop(mesh, own);
        if (!merged) return false;
        loop = merged.loop;
      }
      loop = loop.filter((id) => id !== vid);
      if (!checkPolygon(mesh, loop).ok) return false;
      adds.push({ poly: loop, color: firstColor(mesh, own), tris: null });
    }
  } else {
    const merged = mergeLoop(mesh, members);
    if (!merged) return false;
    const loop = merged.loop.filter((id) => id !== vid);
    if (!checkPolygon(mesh, loop).ok || hasFaceWithSameCorners(mesh, loop, removed)) return false;
    adds.push({ poly: loop, color: firstColor(mesh, members), tris: null });
  }
  replaceFaces(mesh, removed, adds);
  return true;
}

function dissolveVertices(mesh, ids) {
  let changed = 0;
  for (const vid of ids) if (dissolveVertex(mesh, vid)) changed++;
  if (!changed) return { notice: "That vertex can't be dissolved" };
  return { changed: true };
}

// Run Dissolve on the current selection (face, edge or vertex mode).
// Returns true when something changed; otherwise sm.toolNotice says why.
export function dissolveSelection(sm) {
  sm.toolNotice = null;
  const sel = sm.selection;
  const mesh = sm.getMesh?.(sel?.meshId);
  if (!mesh || !sel.indices?.length || !['face', 'edge', 'vertex'].includes(sel.type)) {
    sm.toolNotice = 'Select something to dissolve';
    return false;
  }
  const snapshot = sm.captureSnapshot();
  mesh.lockTriangulationDiagonals();
  let result;
  if (sel.type === 'face') result = dissolveFaces(mesh, sel.indices);
  else if (sel.type === 'edge') result = dissolveEdges(mesh, sel.indices);
  else result = dissolveVertices(mesh, sel.indices.map((i) => mesh.vertices[i]?.id).filter((id) => id != null));
  if (!result.changed) {
    sm.toolNotice = result.notice || 'Nothing to dissolve';
    return false;
  }
  cleanupCommittedTopology(mesh);
  sm.pushUndoSnapshot(snapshot);
  sm.rebuildThreeMesh(mesh.id);
  if (sel.type === 'face' && result.merged?.length) {
    const wanted = new Set(result.merged.map((m) => [...m.poly].sort((a, b) => a - b).join(',')));
    const indices = [];
    mesh.faces.forEach((f, i) => { if (wanted.has([...f].sort((a, b) => a - b).join(','))) indices.push(i); });
    if (indices.length) sm.setSelection({ meshId: mesh.id, type: 'face', indices });
    else sm.clearSelection();
  } else {
    sm.clearSelection();
  }
  sm.updateStats();
  return true;
}
