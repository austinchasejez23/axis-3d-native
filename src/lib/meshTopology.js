// Shared low-level mesh topology helpers used by the mesh tools and the bevel.

let _vidCounter = 0;
export const newVid = () => Date.now() + (_vidCounter++);
export const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
// Position key: points within 1e-5 of each other share a key.
export const posKey = (p) => `${Math.round(p.x / 1e-5)},${Math.round(p.y / 1e-5)},${Math.round(p.z / 1e-5)}`;

// Faces that use both v1 and v2 as a shared edge (adjacent faces to edge v1-v2).
export function adjacentFaceIndicesForEdge(mesh, v1, v2) {
  const res = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi];
    for (let i = 0; i < f.length; i++) {
      if ((f[i] === v1 && f[(i + 1) % f.length] === v2) || (f[i] === v2 && f[(i + 1) % f.length] === v1)) {
        res.push(fi);
        break;
      }
    }
  }
  return res;
}

// Weld vertices that sit at the same spot. Geometry built by extruding can end
// up with separate walls whose corner vertices coincide but are distinct ids —
// so the faces never officially share an edge. Every mesh tool that needs to
// know "which faces touch this edge" then finds one face instead of two and
// silently does nothing. Welding first makes that topology real.
export function weldCoincidentVertices(mesh, tol = 1e-5) {
  const q = (n) => Math.round(n / tol);
  const byPos = new Map();
  const remap = new Map();
  for (const v of mesh.vertices) {
    const key = `${q(v.x)},${q(v.y)},${q(v.z)}`;
    if (byPos.has(key)) remap.set(v.id, byPos.get(key));
    else byPos.set(key, v.id);
  }
  return applyVertexRemap(mesh, remap);
}

// Merge every vertex that sits within `dist` (mesh-local units) of another
// one, by true distance rather than grid cell. Each vertex joins the first
// kept vertex found within range; a hash grid keeps the neighbor search local.
export function mergeVerticesWithin(mesh, dist) {
  const cell = (n) => Math.floor(n / dist);
  const grid = new Map();
  const remap = new Map();
  for (const v of mesh.vertices) {
    const cx = cell(v.x), cy = cell(v.y), cz = cell(v.z);
    let target = null;
    outer: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const k of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (Math.hypot(k.x - v.x, k.y - v.y, k.z - v.z) <= dist) { target = k; break outer; }
      }
    }
    if (target) remap.set(v.id, target.id);
    else {
      const key = `${cx},${cy},${cz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(v);
    }
  }
  return applyVertexRemap(mesh, remap);
}

function applyVertexRemap(mesh, remap) {
  if (remap.size === 0) return false;
  const to = (id) => remap.get(id) ?? id;
  mesh.faces = mesh.faces
    .map((f) => {
      const out = [];
      for (const vid of f.map(to)) if (out.length === 0 || out[out.length - 1] !== vid) out.push(vid);
      if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
      return out;
    })
    .filter((f) => f.length >= 3);
  mesh.explicitEdges = mesh.explicitEdges.map((e) => ({ ...e, v1: to(e.v1), v2: to(e.v2) })).filter((e) => e.v1 !== e.v2);
  const remapEdges = (list) => (list || []).map((e) => {
    const a = to(e.v1), b = to(e.v2);
    return { ...e, v1: Math.min(a, b), v2: Math.max(a, b) };
  }).filter((e) => e.v1 !== e.v2);
  mesh.hiddenEdges = remapEdges(mesh.hiddenEdges);
  mesh.visibleEdges = remapEdges(mesh.visibleEdges);
  mesh.vertices = mesh.vertices.filter((v) => !remap.has(v.id));
  mesh.invalidateCache();
  return true;
}