// Fast in-place geometry update used while a gesture is deforming a mesh.
//
// The normal path (EditableMesh.toBufferGeometry) allocates brand new position,
// color, normal and UV arrays and a fresh BufferGeometry on EVERY frame of a
// drag — on a dense mesh that allocation is the whole reason large models lag.
// This writes the new vertex positions and normals straight into the geometry's
// EXISTING typed arrays instead: no allocation, no geometry churn.
//
// Visuals are unchanged: positions and normals (flat or smooth, matching the
// mesh's shading) are both refreshed, and colors can't change during a
// transform. Anything this can't reproduce exactly returns false so the caller
// falls back to the full rebuild.
export function updateGeometryInPlace(mesh, geometry) {
  // Textured meshes need their UVs reprojected from the new positions, which
  // only the full rebuild does.
  if (mesh.mapTexture) return false;

  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  if (!posAttr || !normAttr) return false;

  const faces = mesh.faces;
  let corners = 0;
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    const triangles = mesh.getFaceTriangleIndices(fi);
    // The fast buffer writer assumes a triangle fan. For concave Boolean
    // faces or removed collinear corners, the renderer uses ear clipping
    // instead, so request a normal full rebuild rather than corrupting the
    // existing vertex buffer during a drag.
    if (triangles.length !== Math.max(0, f.length - 2) ||
        triangles.some((tri, i) => tri[0] !== 0 || tri[1] !== i + 1 || tri[2] !== i + 2)) return false;
    corners += triangles.length * 3;
  }
  // Face/vertex topology changed (cut, extrude, delete): sizes no longer match.
  if (corners === 0 || corners !== posAttr.count) return false;

  // Face normals, computed with plain math so no vectors are allocated.
  const fn = new Float32Array(faces.length * 3);
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    const a = mesh.getVertex(f[0]), b = mesh.getVertex(f[1]), c = mesh.getVertex(f[2]);
    if (!a || !b || !c) return false;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    fn[fi * 3] = nx / len; fn[fi * 3 + 1] = ny / len; fn[fi * 3 + 2] = nz / len;
  }

  // Match EditableMesh soft normals: blend per face-corner only with incident
  // faces inside 60 degrees. This keeps curved surfaces continuous without
  // smearing normals across hard transitions.
  let incident = null;
  const softCos = Math.cos(Math.PI / 3);
  if (mesh.smoothShading) {
    incident = new Map();
    for (let fi = 0; fi < faces.length; fi++) {
      for (const vid of faces[fi]) {
        let list = incident.get(vid);
        if (!list) { list = []; incident.set(vid, list); }
        list.push(fi);
      }
    }
  }
  const softNormal = (fi, vid) => {
    if (!incident) return null;
    const bx = fn[fi * 3], by = fn[fi * 3 + 1], bz = fn[fi * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (const oi of incident.get(vid) || [fi]) {
      const ox = fn[oi * 3], oy = fn[oi * 3 + 1], oz = fn[oi * 3 + 2];
      if (bx * ox + by * oy + bz * oz >= softCos) { x += ox; y += oy; z += oz; }
    }
    const l = Math.hypot(x, y, z);
    return l > 1e-6 ? [x / l, y / l, z / l] : [bx, by, bz];
  };

  const pos = posAttr.array;
  const nor = normAttr.array;
  let o = 0;
  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    for (let t = 0; t < face.length - 2; t++) {
      for (const vi of [0, t + 1, t + 2]) {
        const vid = face[vi];
        const v = mesh.getVertex(vid);
        if (!v) return false;
        pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        const n = incident ? softNormal(fi, vid) : null;
        if (n) { nor[o] = n[0]; nor[o + 1] = n[1]; nor[o + 2] = n[2]; }
        else { nor[o] = fn[fi * 3]; nor[o + 1] = fn[fi * 3 + 1]; nor[o + 2] = fn[fi * 3 + 2]; }
        o += 3;
      }
    }
  }

  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;
  // Raycasting and frustum culling both read the bounding sphere, so it has to
  // follow the moved geometry.
  geometry.computeBoundingSphere();
  return true;
}