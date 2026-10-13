import { newVid } from './meshTopology';

export function subdivideMesh(sm) {
  const sel = sm.selection;
  if (!sel.meshId) return;
  sm.pushUndo();
  const mesh = sm.getMesh(sel.meshId);
  if (!mesh) return;
  subdivideMeshInPlace(mesh);
  mesh.primitiveType = null;
  mesh.segments = null;
  sm.rebuildThreeMesh(mesh.id);
  sm.clearSelection();
}

// Core face-split (quad-aware): splits every face into 4, adding midpoint
// vertices. Pure mesh mutation, no undo/selection/rebuild side effects — used
// both by the Subdivide tool and to auto-densify a low-poly mesh for painting.
export function subdivideMeshInPlace(mesh, showSubdivisionGrid = true) {
  const visited = new Set(), groups = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    if (visited.has(i)) continue;
    const group = mesh.getCoplanarFaceGroup(i);
    let mate = -1;
    if (group.length === 2) {
      const other = group.find(g => g !== i);
      const f1 = mesh.faces[i], f2 = mesh.faces[other];
      // Only two stored triangles can represent the hidden diagonal of one
      // logical quad. Never collapse an n-gon into the first three vertices.
      if (f1.length === 3 && f2.length === 3 && f2.filter(v => f1.includes(v)).length === 2) mate = other;
    }
    if (mate >= 0) {
      visited.add(i); visited.add(mate);
      const f1 = mesh.faces[i], f2 = mesh.faces[mate];
      const [P, Q] = f1.filter(v => f2.includes(v));
      groups.push({ type: 'quad', R: f1.find(v => v !== P && v !== Q), P, S: f2.find(v => v !== P && v !== Q), Q });
    } else {
      visited.add(i);
      groups.push({ type: mesh.faces[i].length === 3 ? 'tri' : 'poly', face: i });
    }
  }
  const newFaces = [], newExplicit = mesh.explicitEdges.map(e => ({ ...e }));
  const addVertex = (x, y, z) => {
    const vertex = { id: newVid(), x, y, z };
    mesh.vertices.push(vertex);
    return vertex.id;
  };
  const mid = (va, vb) => addVertex((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
  for (const g of groups) {
    if (g.type === 'quad') {
      const R = mesh.getVertex(g.R), P = mesh.getVertex(g.P), S = mesh.getVertex(g.S), Q = mesh.getVertex(g.Q);
      const mRP = mid(R, P), mPS = mid(P, S), mSQ = mid(S, Q), mQR = mid(Q, R), ctr = mid(P, Q);
      newFaces.push([g.R, mRP, ctr], [g.R, ctr, mQR], [mRP, g.P, mPS], [mRP, mPS, ctr]);
      newFaces.push([ctr, mPS, g.S], [ctr, g.S, mSQ], [mQR, ctr, mSQ], [mQR, mSQ, g.Q]);
      if (showSubdivisionGrid) newExplicit.push({ v1: ctr, v2: mRP }, { v1: ctr, v2: mPS }, { v1: ctr, v2: mSQ }, { v1: ctr, v2: mQR });
    } else if (g.type === 'tri') {
      const f = mesh.faces[g.face], a = mesh.getVertex(f[0]), b = mesh.getVertex(f[1]), c = mesh.getVertex(f[2]);
      const m1 = mid(a, b), m2 = mid(b, c), m3 = mid(a, c);
      newFaces.push([f[0], m1, m3], [m1, f[1], m2], [m3, m2, f[2]], [m1, m2, m3]);
    } else {
      // Standard polygon subdivision: one midpoint per boundary edge plus a
      // center vertex, producing one quad around each original vertex.
      const f = mesh.faces[g.face];
      const vertices = f.map((id) => mesh.getVertex(id));
      if (vertices.some((vertex) => !vertex)) continue;
      const center = vertices.reduce((acc, vertex) => {
        acc.x += vertex.x; acc.y += vertex.y; acc.z += vertex.z;
        return acc;
      }, { x: 0, y: 0, z: 0 });
      center.x /= vertices.length; center.y /= vertices.length; center.z /= vertices.length;
      const centerId = addVertex(center.x, center.y, center.z);
      const mids = vertices.map((vertex, index) => mid(vertex, vertices[(index + 1) % vertices.length]));
      for (let index = 0; index < f.length; index++) {
        const prevMid = mids[(index + f.length - 1) % f.length];
        newFaces.push([f[index], mids[index], centerId, prevMid]);
        if (showSubdivisionGrid) newExplicit.push({ v1: centerId, v2: mids[index] });
      }
    }
  }
  mesh.faces = newFaces;
  mesh.explicitEdges = newExplicit;
  mesh.invalidateCache();
}