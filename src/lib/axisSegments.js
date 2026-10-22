import { newVid } from './meshTopology';

// Insert shared axis-aligned section loops without replacing the original mesh.
// Each face is clipped on both sides of every section plane. Shared edge
// intersections reuse one vertex, keeping adjacent faces welded.
export function segmentEditedMesh(mesh, counts) {
  const original = mesh.vertices.map(v => ({ ...v }));
  if (!original.length || !mesh.faces.length) return;
  const bounds = {};
  for (const axis of ['x', 'y', 'z']) {
    const values = original.map(v => v[axis]);
    bounds[axis] = [Math.min(...values), Math.max(...values)];
  }
  let faces = mesh.faces.map(f => [...f]);
  for (const axis of ['x', 'y', 'z']) {
    const count = Math.min(64, Math.max(1, Math.floor(counts[axis] || 1)));
    const [lo, hi] = bounds[axis];
    if (count <= 1 || hi - lo < 1e-8) continue;
    for (let section = 1; section < count; section++) {
      const plane = lo + (hi - lo) * section / count;
      const cache = new Map();
      const vertex = id => mesh.getVertex(id);
      const intersection = (a, b) => {
        const key = a < b ? a + ':' + b : b + ':' + a;
        if (cache.has(key)) return cache.get(key);
        const va = vertex(a), vb = vertex(b);
        const t = (plane - va[axis]) / (vb[axis] - va[axis]);
        const id = newVid();
        mesh.vertices.push({ id, x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t, z: va.z + (vb.z - va.z) * t });
        cache.set(key, id);
        return id;
      };
      const clip = (face, positive) => {
        const out = [];
        for (let i = 0; i < face.length; i++) {
          const a = face[i], b = face[(i + 1) % face.length];
          const da = vertex(a)[axis] - plane, db = vertex(b)[axis] - plane;
          const insideA = positive ? da >= -1e-8 : da <= 1e-8;
          const insideB = positive ? db >= -1e-8 : db <= 1e-8;
          if (insideA) out.push(a);
          if (insideA !== insideB && Math.abs(da) > 1e-8 && Math.abs(db) > 1e-8) out.push(intersection(a, b));
        }
        const clean = out.filter((id, i) => id !== out[(i + out.length - 1) % out.length]);
        return new Set(clean).size >= 3 ? clean : null;
      };
      const next = [];
      for (const face of faces) {
        const ds = face.map(id => vertex(id)[axis] - plane);
        if (!ds.some(d => d < -1e-8) || !ds.some(d => d > 1e-8)) { next.push(face); continue; }
        const low = clip(face, false), high = clip(face, true);
        if (low) next.push(low);
        if (high) next.push(high);
      }
      faces = next;
    }
  }
  mesh.faces = faces;
  mesh.primitiveType = null;
  mesh.segments = null;
  mesh.invalidateCache();
}
