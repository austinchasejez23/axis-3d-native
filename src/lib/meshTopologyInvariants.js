// Committed (not preview) mesh topology rules:
// - a vertex belongs to at least one face
// - a stored edge belongs to a face perimeter
// - no surviving face has fewer than three distinct, existing corners
// - deleting a shared boundary either dissolves adjacent compatible faces,
//   or leaves the edge in place (never makes it merely invisible).
import * as THREE from 'three';
import { edgeKey } from './meshTopology';

export function adjacentFacesForBoundary(mesh, a, b) {
  const result = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    for (let i = 0; i < face.length; i++) {
      if ((face[i] === a && face[(i + 1) % face.length] === b) ||
          (face[i] === b && face[(i + 1) % face.length] === a)) {
        result.push({ fi, face, i });
        break;
      }
    }
  }
  return result;
}

function polygonNormal(mesh, face) {
  const n = new THREE.Vector3();
  for (let i = 0; i < face.length; i++) {
    const p = mesh.getVertex(face[i]), q = mesh.getVertex(face[(i + 1) % face.length]);
    if (!p || !q) return null;
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  }
  return n.lengthSq() > 1e-18 ? n.normalize() : null;
}

export function isSimplePolygon(mesh, face, normal) {
  const axis = Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z) ? 'x'
    : Math.abs(normal.y) >= Math.abs(normal.z) ? 'y' : 'z';
  const project = (v) => axis === 'x' ? [v.y, v.z] : axis === 'y' ? [v.x, v.z] : [v.x, v.y];
  const pts = face.map(id => project(mesh.getVertex(id)));
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (p, q, r) => q[0] >= Math.min(p[0], r[0]) - 1e-9 && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-9 && q[1] <= Math.max(p[1], r[1]) + 1e-9;
  const intersects = (a, b, c, d) => {
    const s1 = cross(a, b, c), s2 = cross(a, b, d);
    const s3 = cross(c, d, a), s4 = cross(c, d, b);
    if (s1 * s2 < -1e-16 && s3 * s4 < -1e-16) return true;
    return (Math.abs(s1) < 1e-9 && onSegment(a, c, b)) ||
      (Math.abs(s2) < 1e-9 && onSegment(a, d, b)) ||
      (Math.abs(s3) < 1e-9 && onSegment(c, a, d)) ||
      (Math.abs(s4) < 1e-9 && onSegment(c, b, d));
  };
  let twiceArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[(i + 1) % pts.length];
    twiceArea += x * ny - nx * y;
    for (let j = i + 1; j < pts.length; j++) {
      if (j === i + 1 || (i === 0 && j === pts.length - 1)) continue;
      if (intersects(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length])) return false;
    }
  }
  return Math.abs(twiceArea) > 1e-12;
}

// A DIVIDING edge separates two faces; deleting it merges them. An edge
// with only one face is that face's outer border and cannot be deleted.
export function isDividingEdge(mesh, a, b) {
  return adjacentFacesForBoundary(mesh, a, b).length === 2;
}

// Outline of `face` from `from` to `to` that uses none of the shared edges.
function arcAvoiding(face, from, to, sharedKeys) {
  const start = face.indexOf(from);
  if (start < 0 || face.indexOf(to) < 0) return null;
  for (const dir of [1, -1]) {
    const path = [from];
    let ok = true;
    for (let j = start, steps = 0; steps < face.length; steps++) {
      const next = (j + dir + face.length) % face.length;
      if (sharedKeys.has(edgeKey(face[j], face[next]))) { ok = false; break; }
      path.push(face[next]);
      j = next;
      if (face[j] === to) break;
    }
    if (ok && path[path.length - 1] === to) return path;
  }
  return null;
}

// Delete a dividing edge by merging the two faces it separates. When the
// faces share a longer dividing line (a cut through several points), the
// whole line goes and its in-between points are dropped with it.
export function dissolveSharedBoundary(mesh, a, b, { requireDivider = false } = {}) {
  if (adjacentFacesForBoundary(mesh, a, b).length !== 2) return false;
  if (requireDivider && !isDividingEdge(mesh, a, b)) return false;
  if (!requireDivider) return mergeFacesAcross(mesh, a, b);
  // A visible face may be stored as triangles joined by hidden diagonals.
  // Merge those first, so the whole visible faces on both sides combine and
  // no hidden diagonal is left behind as a new border.
  const snapshot = {
    faces: mesh.faces.map(f => [...f]),
    faceColors: { ...mesh.faceColors },
    faceRenderTriangles: JSON.parse(JSON.stringify(mesh.faceRenderTriangles || {})),
  };
  const hidden = new Set((mesh.hiddenEdges || []).map(e => edgeKey(e.v1, e.v2)));
  const target = edgeKey(a, b);
  for (let guard = 0; guard < 10000; guard++) {
    let merged = false;
    for (const { face } of adjacentFacesForBoundary(mesh, a, b)) {
      for (let i = 0; i < face.length && !merged; i++) {
        const x = face[i], y = face[(i + 1) % face.length], key = edgeKey(x, y);
        if (key === target || !hidden.has(key)) continue;
        if (adjacentFacesForBoundary(mesh, x, y).length !== 2) continue;
        merged = mergeFacesAcross(mesh, x, y, { keepTriangles: true });
      }
      if (merged) break;
    }
    if (!merged) break;
  }
  if (adjacentFacesForBoundary(mesh, a, b).length === 2 && mergeFacesAcross(mesh, a, b)) return true;
  mesh.faces = snapshot.faces;
  mesh.faceColors = snapshot.faceColors;
  mesh.faceRenderTriangles = snapshot.faceRenderTriangles;
  mesh.invalidateCache();
  return false;
}

function mergeFacesAcross(mesh, a, b, { keepTriangles = false } = {}) {
  const adjoining = adjacentFacesForBoundary(mesh, a, b);
  if (adjoining.length !== 2) return false;
  const [one, two] = adjoining;
  // A merged face uses its first face's fill color when colors differ.

  const edgesOf = face => face.map((id, i) => edgeKey(id, face[(i + 1) % face.length]));
  const keysTwo = new Set(edgesOf(two.face));
  const sharedKeys = new Set(edgesOf(one.face).filter(k => keysTwo.has(k)));
  // Grow the shared line from the selected edge through points used only
  // by these two faces.
  const otherUse = id => mesh.faces.some((f, fi) => fi !== one.fi && fi !== two.fi && f.includes(id));
  const degree = id => [...sharedKeys].filter(k => k.split(',').map(Number).includes(id)).length;
  const chain = new Set([edgeKey(a, b)]);
  const interior = new Set();
  const extend = (end, prev) => {
    let cur = end, last = prev;
    while (degree(cur) === 2 && !otherUse(cur)) {
      const nextKey = [...sharedKeys].find(k => !chain.has(k) && k.split(',').map(Number).includes(cur));
      if (!nextKey) break;
      interior.add(cur);
      chain.add(nextKey);
      const [x, y] = nextKey.split(',').map(Number);
      last = cur;
      cur = x === cur ? y : x;
      if (cur === end) return null;
    }
    return cur;
  };
  const s = extend(a, b), t = extend(b, a);
  if (s == null || t == null || s === t) return false;
  // Faces touching along two separate lines would leave a hole when merged.
  if (chain.size !== sharedKeys.size) return false;
  const arc1 = arcAvoiding(one.face, t, s, chain);
  const arc2 = arcAvoiding(two.face, s, t, chain);
  if (!arc1 || !arc2) return false;
  const merged = [...arc1, ...arc2.slice(1, -1)];
  if (merged.length < 3 || new Set(merged).size !== merged.length) return false;
  if (merged.some(id => interior.has(id))) return false;
  const n1 = polygonNormal(mesh, one.face), n2 = polygonNormal(mesh, two.face);
  if (!n1 || !n2) return false;
  const normal = polygonNormal(mesh, merged);
  if (!normal) return false;
  const origin = mesh.getVertex(merged[0]);
  const scale = Math.max(1e-6, ...merged.map(id => {
    const v = mesh.getVertex(id);
    return Math.hypot(v.x - origin.x, v.y - origin.y, v.z - origin.z);
  }));
  const planar = Math.abs(n1.dot(n2)) >= 0.9995 && merged.every(id => {
    const v = mesh.getVertex(id);
    return Math.abs((v.x - origin.x) * normal.x + (v.y - origin.y) * normal.y +
      (v.z - origin.z) * normal.z) <= scale * 1e-4;
  });
  if (planar && !isSimplePolygon(mesh, merged, normal)) return false;

  // Hidden diagonals keep the exact triangles they had, so the surface
  // does not visibly change when they are absorbed.
  // Points dropped from a longer dividing line can only go on a flat face;
  // on a bent surface removing them would change the shape.
  if (interior.size && !planar) return false;
  const preserve = !interior.size && (keepTriangles || !planar ||
    mesh.faceRenderTriangles?.[one.fi] || mesh.faceRenderTriangles?.[two.fi]);
  const oldTriangles = preserve ? [one, two].flatMap(({ fi, face }) =>
    (mesh.faceRenderTriangles?.[fi] ||
      mesh.getFaceTriangleIndices(fi).map(tri => tri.map(i => face[i])))
      .map(tri => [...tri])) : null;
  if (oldTriangles && (oldTriangles.length !== merged.length - 2 || oldTriangles.some(tri => {
    if (tri.length !== 3 || tri.some(id => !merged.includes(id))) return true;
    const a = mesh.getVertexVector(tri[0]), b = mesh.getVertexVector(tri[1]), c = mesh.getVertexVector(tri[2]);
    return b.sub(a).cross(c.sub(a)).lengthSq() < 1e-20;
  }))) return false;

  // The surviving face index shifts if the removed face comes first.
  // Keep colors and saved render triangles aligned with that final index.
  const keep = Math.min(one.fi, two.fi);
  const drop = Math.max(one.fi, two.fi);
  const renderTriangles = {};
  for (const [index, tris] of Object.entries(mesh.faceRenderTriangles || {})) {
    const fi = Number(index);
    if (fi === one.fi || fi === two.fi) continue;
    renderTriangles[fi > drop ? fi - 1 : fi] = tris;
  }
  if (oldTriangles) renderTriangles[keep] = oldTriangles;
  const colors = { ...mesh.faceColors };
  const keptColor = colors[one.fi] ?? colors[two.fi];
  mesh.faces[keep] = merged;
  mesh.faces.splice(drop, 1);
  mesh.faceRenderTriangles = renderTriangles;
  mesh.faceColors = {};
  for (const [index, color] of Object.entries(colors)) {
    const fi = Number(index);
    if (fi === one.fi || fi === two.fi) continue;
    mesh.faceColors[fi > drop ? fi - 1 : fi] = color;
  }
  if (keptColor != null) mesh.faceColors[keep] = keptColor;
  mesh.invalidateCache();
  return true;
}

export function removeFaceByIndex(mesh, index) {
  if (index < 0 || index >= mesh.faces.length) return false;
  mesh.faces.splice(index, 1);
  const colors = { ...mesh.faceColors };
  mesh.faceColors = {};
  for (const [fi, color] of Object.entries(colors)) {
    const idx = Number(fi);
    if (idx === index) continue;
    mesh.faceColors[idx > index ? idx - 1 : idx] = color;
  }
  const keptTriangulations = {};
  for (const [fi, triangles] of Object.entries(mesh.faceRenderTriangles || {})) {
    const idx = Number(fi);
    if (idx !== index) keptTriangulations[idx > index ? idx - 1 : idx] = triangles;
  }
  mesh.faceRenderTriangles = keptTriangulations;
  mesh.invalidateCache();
  return true;
}

// Run ONLY after a committed operation (or as part of a user-requested
// cleanup). Temporary in-progress cut/draw/vertex sessions may carry previews.
export function cleanupCommittedTopology(mesh) {
  const validVertices = new Set(mesh.vertices.map(v => v.id));
  const priorFaces = mesh.faces || [];
  const faces = [], colors = {}, renderTriangles = {};
  for (let fi = 0; fi < priorFaces.length; fi++) {
    const face = priorFaces[fi];
    if (!Array.isArray(face)) continue;
    const compact = face.filter((id, i) => i === 0 || id !== face[i - 1]);
    if (compact.length > 1 && compact[0] === compact[compact.length - 1]) compact.pop();
    if (compact.length < 3 || new Set(compact).size !== compact.length ||
        compact.some(id => !validVertices.has(id))) continue;
    if (mesh.faceColors?.[fi] != null) colors[faces.length] = mesh.faceColors[fi];
    const stored = mesh.faceRenderTriangles?.[fi];
    if (stored?.length === compact.length - 2 && stored.every(tri =>
      tri.length === 3 && new Set(tri).size === 3 && tri.every(id => compact.includes(id)))) {
      renderTriangles[faces.length] = stored.map(tri => [...tri]);
    }
    faces.push(compact);
  }
  mesh.faces = faces;
  mesh.faceColors = colors;
  mesh.faceRenderTriangles = renderTriangles;
  const used = new Set(faces.flat());
  mesh.vertices = mesh.vertices.filter(v => used.has(v.id));
  mesh.vertexColors = Object.fromEntries(
    Object.entries(mesh.vertexColors || {}).filter(([id]) => used.has(Number(id)))
  );
  const border = new Set();
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    border.add(edgeKey(face[i], face[(i + 1) % face.length]));
  }
  const keepEdges = (items) => {
    const seen = new Set();
    return (items || []).filter(e => {
      const key = edgeKey(e.v1, e.v2);
      if (e.v1 === e.v2 || !border.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  mesh.explicitEdges = keepEdges(mesh.explicitEdges);
  mesh.visibleEdges = keepEdges(mesh.visibleEdges);
  mesh.hiddenEdges = keepEdges(mesh.hiddenEdges);
  mesh.paintWireEdges = mesh.paintWireEdges ? keepEdges(mesh.paintWireEdges) : null;
  mesh.invalidateCache();
  return mesh;
}

// A hidden user-deleted SHARED border is not permitted. Merge compatible
// neighboring faces, or restore the border if a merge would break the surface.
export function resolveLegacyDeletedBorders(mesh) {
  const hidden = (mesh.hiddenEdges || []).filter(edge => edge.user);
  let changed = false;
  for (const e of hidden) {
    if (adjacentFacesForBoundary(mesh, e.v1, e.v2).length === 2) {
      if (dissolveSharedBoundary(mesh, e.v1, e.v2)) changed = true;
    }
  }
  if (hidden.length) {
    mesh.hiddenEdges = (mesh.hiddenEdges || []).filter(e => !e.user);
    changed = true;
  }
  if (changed) cleanupCommittedTopology(mesh);
  return changed;
}
