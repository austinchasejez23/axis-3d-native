// The ids of a mesh's vertices that lie within `epsilon` (on every axis) of
// any of `positions`. Same result as testing every vertex against every
// position, but the positions are put into a grid first, so each vertex only
// checks the few positions in its own cell: a face rotation used to compare
// every vertex of the mesh with every selected vertex on every frame.
const CELL = 1e-4;

export function coincidentVertexIds(mesh, positions, epsilon) {
  const out = [];
  if (!positions.length) return out;
  const cells = new Map();
  const key = (ix, iy, iz) => Math.imul(ix | 0, 73856093) ^ Math.imul(iy | 0, 19349663) ^ Math.imul(iz | 0, 83492791);
  for (const p of positions) {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL));
    const list = cells.get(k);
    if (list) list.push(p); else cells.set(k, [p]);
  }
  // A position within epsilon of a vertex is in the vertex's cell, or in the
  // next cell over on an axis where the vertex sits that close to the edge.
  const margin = epsilon * 2;
  const offsets = (value) => {
    const f = value / CELL;
    const i = Math.floor(f);
    const frac = (f - i) * CELL;
    const list = [i];
    if (frac <= margin) list.push(i - 1);
    if (CELL - frac <= margin) list.push(i + 1);
    return list;
  };
  for (const v of mesh.vertices) {
    const xs = offsets(v.x), ys = offsets(v.y), zs = offsets(v.z);
    let found = false;
    for (let a = 0; a < xs.length && !found; a++) {
      for (let b = 0; b < ys.length && !found; b++) {
        for (let c = 0; c < zs.length && !found; c++) {
          const list = cells.get(key(xs[a], ys[b], zs[c]));
          if (!list) continue;
          for (const p of list) {
            if (Math.abs(v.x - p.x) <= epsilon && Math.abs(v.y - p.y) <= epsilon && Math.abs(v.z - p.z) <= epsilon) {
              found = true; break;
            }
          }
        }
      }
    }
    if (found) out.push(v.id);
  }
  return out;
}
