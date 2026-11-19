// Fast in-place geometry update used while a gesture is deforming a mesh.
//
// The normal path (EditableMesh.toBufferGeometry) allocates brand new position,
// color, normal and UV arrays and a fresh BufferGeometry on EVERY frame of a
// drag — on a dense mesh that allocation is the whole reason large models lag.
// This writes the new vertex positions and normals straight into the geometry's
// EXISTING typed arrays instead: no allocation, no geometry churn.
//
// Visuals are unchanged: positions and normals are written in exactly the
// order and with exactly the math of the full builder — the same triangles of
// every face (fan, ear clipped or preserved), the same polygon normals, the
// same soft normals and the same per-triangle normals of preserved faces.
// Colors can't change during a transform. Anything this can't reproduce
// exactly returns false so the caller falls back to the full rebuild.

// Where each buffer corner comes from, in the full builder's face and triangle
// order. Kept on the geometry and reused while the faces and their triangles
// are unchanged, so a drag does not work the triangulation out again on every
// frame.
function buildLayout(mesh) {
  const faces = mesh.faces;
  const vertexIndex = new Map();
  mesh.vertices.forEach((v, i) => vertexIndex.set(v.id, i));
  let total = 0;
  for (const f of faces) total += f.length;
  const faceStart = new Int32Array(faces.length + 1);
  const faceVid = new Int32Array(total);
  const faceVi = new Int32Array(total);
  const preservedRefs = new Array(faces.length);
  const cornerK = [];
  const triPreserved = [];
  // Faces whose triangles are worked out from where their vertices are
  // (a polygon without preserved triangles) can triangulate differently once
  // they move, so a layout holding them is only good for this one frame.
  let positionDependent = false;
  let k = 0;
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    faceStart[fi] = k;
    for (const vid of f) {
      const vi = vertexIndex.get(vid);
      if (vi === undefined) return null;
      faceVid[k] = vid; faceVi[k] = vi; k++;
    }
    const preserved = mesh.faceRenderTriangles?.[fi];
    preservedRefs[fi] = preserved;
    if (f.length > 3 && !preserved?.length) positionDependent = true;
    const base = faceStart[fi];
    for (const tri of mesh.getFaceTriangleIndices(fi)) {
      triPreserved.push(preserved ? 1 : 0);
      for (const ci of tri) cornerK.push(base + ci);
    }
  }
  faceStart[faces.length] = k;
  // Faces touching each vertex, in face order, exactly as the full builder
  // lists them for soft normals.
  let incStart = null, incFaces = null;
  if (mesh.smoothShading) {
    incStart = new Int32Array(mesh.vertices.length + 1);
    for (let j = 0; j < total; j++) incStart[faceVi[j] + 1]++;
    for (let i = 0; i < mesh.vertices.length; i++) incStart[i + 1] += incStart[i];
    incFaces = new Int32Array(total);
    const fill = incStart.slice(0, mesh.vertices.length);
    for (let fi = 0; fi < faces.length; fi++) {
      for (let j = faceStart[fi]; j < faceStart[fi + 1]; j++) incFaces[fill[faceVi[j]]++] = fi;
    }
  }
  return {
    faceCount: faces.length,
    vertexCount: mesh.vertices.length,
    smooth: !!mesh.smoothShading,
    faceStart, faceVid, faceVi, preservedRefs,
    cornerK: Int32Array.from(cornerK),
    triPreserved: Uint8Array.from(triPreserved),
    anyPreserved: triPreserved.includes(1),
    incStart, incFaces,
    positionDependent,
  };
}

// The layout still describes this mesh: same faces with the same vertices in
// the same places of the vertex list, same preserved triangles, same shading.
function layoutMatches(layout, mesh) {
  const faces = mesh.faces;
  if (layout.positionDependent || layout.faceCount !== faces.length ||
      layout.vertexCount !== mesh.vertices.length || layout.smooth !== !!mesh.smoothShading) return false;
  const { faceStart, faceVid, faceVi, preservedRefs } = layout;
  const verts = mesh.vertices;
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    const s = faceStart[fi];
    if (faceStart[fi + 1] - s !== f.length) return false;
    if (preservedRefs[fi] !== mesh.faceRenderTriangles?.[fi]) return false;
    for (let j = 0; j < f.length; j++) {
      if (faceVid[s + j] !== f[j] || verts[faceVi[s + j]]?.id !== f[j]) return false;
    }
  }
  return true;
}

export function updateGeometryInPlace(mesh, geometry) {
  // Textured meshes need their UVs reprojected from the new positions, which
  // only the full rebuild does.
  if (mesh.mapTexture) return false;

  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  if (!posAttr || !normAttr) return false;

  let layout = geometry.userData.axisLiveLayout;
  if (!layout || !layoutMatches(layout, mesh)) {
    layout = buildLayout(mesh);
    if (!layout) return false;
    geometry.userData.axisLiveLayout = layout;
  }
  const { faceCount, faceStart, faceVi, cornerK, triPreserved, incStart, incFaces } = layout;
  // Face/vertex topology changed (cut, extrude, delete): sizes no longer match.
  if (cornerK.length === 0 || cornerK.length !== posAttr.count) return false;

  const verts = mesh.vertices;
  // Polygon normals, as EditableMesh.getFaceNormal computes them (Newell,
  // falling back to the first three corners), with plain math so nothing is
  // allocated.
  const fn = new Float64Array(faceCount * 3);
  for (let fi = 0; fi < faceCount; fi++) {
    const s = faceStart[fi], e = faceStart[fi + 1], n = e - s;
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < n; j++) {
      const p = verts[faceVi[s + j]], q = verts[faceVi[s + (j + 1) % n]];
      x += (p.y - q.y) * (p.z + q.z);
      y += (p.z - q.z) * (p.x + q.x);
      z += (p.x - q.x) * (p.y + q.y);
    }
    if (x * x + y * y + z * z < 1e-22) {
      const a = verts[faceVi[s]], b = verts[faceVi[s + 1]], c = verts[faceVi[s + 2]];
      if (!a || !b || !c) return false;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      x = uy * vz - uz * vy; y = uz * vx - ux * vz; z = ux * vy - uy * vx;
    }
    // Same arithmetic as THREE's normalize(): multiply by the reciprocal.
    const inv = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    fn[fi * 3] = x * inv; fn[fi * 3 + 1] = y * inv; fn[fi * 3 + 2] = z * inv;
  }

  const softCos = Math.cos(60 * (Math.PI / 180));
  const pos = posAttr.array;
  const nor = normAttr.array;
  const triCount = cornerK.length / 3;
  // Normals of preserved triangles, and (with soft normals) whether each face
  // with preserved triangles folds past the soft angle, as the full builder
  // decides it.
  let tn = null, folded = null;
  if (layout.anyPreserved) {
    tn = layout.triNormals || (layout.triNormals = new Float64Array(triCount * 3));
    for (let t = 0; t < triCount; t++) {
      if (!triPreserved[t]) continue;
      const c = t * 3;
      const a = verts[faceVi[cornerK[c]]], b = verts[faceVi[cornerK[c + 1]]], d = verts[faceVi[cornerK[c + 2]]];
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
      let px = uy * vz - uz * vy, py = uz * vx - ux * vz, pz = ux * vy - uy * vx;
      const inv = 1 / (Math.sqrt(px * px + py * py + pz * pz) || 1);
      px *= inv; py *= inv; pz *= inv;
      tn[c] = px; tn[c + 1] = py; tn[c + 2] = pz;
    }
    if (incStart) {
      folded = layout.faceFolded || (layout.faceFolded = new Uint8Array(faceCount));
      let f = 0;
      for (let t = 0; t < triCount;) {
        while (cornerK[t * 3] >= faceStart[f + 1]) f++;
        let end = t + 1;
        while (end < triCount && cornerK[end * 3] < faceStart[f + 1]) end++;
        let fold = 0;
        if (triPreserved[t]) {
          for (let i = t; i < end && !fold; i++) {
            const ax = tn[i * 3], ay = tn[i * 3 + 1], az = tn[i * 3 + 2];
            if (ax * ax + ay * ay + az * az < 0.5) continue;
            for (let j = i + 1; j < end; j++) {
              const bx = tn[j * 3], by = tn[j * 3 + 1], bz = tn[j * 3 + 2];
              if (bx * bx + by * by + bz * bz >= 0.5 && ax * bx + ay * by + az * bz < softCos) { fold = 1; break; }
            }
          }
        }
        folded[f] = fold;
        t = end;
      }
    }
  }
  let fi = 0;
  for (let c = 0; c < cornerK.length; c += 3) {
    const k0 = cornerK[c];
    while (k0 >= faceStart[fi + 1]) fi++;
    const tri = c / 3;
    // Folded polygons keep a normal per preserved triangle. With soft
    // normals, only faces that fold past the soft angle do.
    const keep = triPreserved[tri] && (!incStart || folded[fi]);
    for (let j = 0; j < 3; j++) {
      const vi = faceVi[cornerK[c + j]];
      const v = verts[vi];
      const o = (c + j) * 3;
      pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
      if (keep) {
        nor[o] = tn[c]; nor[o + 1] = tn[c + 1]; nor[o + 2] = tn[c + 2];
      } else if (incStart) {
        // Soft normals: blend only with incident faces inside 60 degrees.
        const bx = fn[fi * 3], by = fn[fi * 3 + 1], bz = fn[fi * 3 + 2];
        let x = 0, y = 0, z = 0;
        for (let m = incStart[vi]; m < incStart[vi + 1]; m++) {
          const oi = incFaces[m];
          const ox = fn[oi * 3], oy = fn[oi * 3 + 1], oz = fn[oi * 3 + 2];
          if (bx * ox + by * oy + bz * oz >= softCos) { x += ox; y += oy; z += oz; }
        }
        const l2 = x * x + y * y + z * z;
        if (l2 > 1e-12) { const inv = 1 / Math.sqrt(l2); nor[o] = x * inv; nor[o + 1] = y * inv; nor[o + 2] = z * inv; }
        else { nor[o] = bx; nor[o + 1] = by; nor[o + 2] = bz; }
      } else {
        nor[o] = fn[fi * 3]; nor[o + 1] = fn[fi * 3 + 1]; nor[o + 2] = fn[fi * 3 + 2];
      }
    }
  }

  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;
  // Raycasting and frustum culling both read the bounding sphere, so it has to
  // follow the moved geometry.
  geometry.computeBoundingSphere();
  if (geometry.boundingBox) geometry.computeBoundingBox();
  return true;
}
