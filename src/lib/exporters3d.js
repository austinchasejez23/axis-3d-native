import * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';

// Shared helper: every face of every mesh, correctly triangulated and baked into
// world space (object position/rotation/scale applied) so the exported file
// matches what is on screen. Returns [{ a, b, c, n }] world-space triangles.
function worldTriangles(mesh) {
  const m = new THREE.Matrix4().compose(
    mesh.position,
    new THREE.Quaternion().setFromEuler(mesh.rotation),
    mesh.scale,
  );
  const pos = new Map();
  for (const v of mesh.vertices) pos.set(v.id, new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(m));
  const tris = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    for (const [i, j, k] of mesh.getFaceTriangleIndices(fi)) {
      const a = pos.get(face[i]), b = pos.get(face[j]), c = pos.get(face[k]);
      if (!a || !b || !c) continue;
      const n = new THREE.Vector3().subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a)).normalize();
      tris.push({ a, b, c, n });
    }
  }
  return tris;
}

// ---- STL (binary) — the standard 3D printing format ----
export function exportSTL(meshes) {
  const tris = meshes.flatMap(worldTriangles);
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  const header = 'AXIS 3D binary STL';
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, tris.length, true);
  let o = 84;
  const put = (v) => {
    view.setFloat32(o, v.x, true);
    view.setFloat32(o + 4, v.y, true);
    view.setFloat32(o + 8, v.z, true);
    o += 12;
  };
  for (const t of tris) {
    put(t.n); put(t.a); put(t.b); put(t.c);
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

// ---- GLB (binary glTF 2.0) — the standard web / AR / game-engine format ----
export function exportGLB(meshes) {
  const json = {
    asset: { version: '2.0', generator: 'AXIS 3D' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunks = [];
  let offset = 0;

  const addAccessor = (data, min, max) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    chunks.push(bytes);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    offset += bytes.byteLength;
    json.accessors.push({
      bufferView: json.bufferViews.length - 1,
      componentType: 5126, // FLOAT
      count: data.length / 3,
      type: 'VEC3',
      ...(min ? { min, max } : {}),
    });
    return json.accessors.length - 1;
  };

  meshes.forEach((mesh, i) => {
    const tris = worldTriangles(mesh);
    if (tris.length === 0) return;
    const positions = new Float32Array(tris.length * 9);
    const normals = new Float32Array(tris.length * 9);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let p = 0;
    for (const t of tris) {
      for (const v of [t.a, t.b, t.c]) {
        positions[p] = v.x; positions[p + 1] = v.y; positions[p + 2] = v.z;
        normals[p] = t.n.x; normals[p + 1] = t.n.y; normals[p + 2] = t.n.z;
        min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
        max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
        p += 3;
      }
    }
    const posAcc = addAccessor(positions, min, max);
    const normAcc = addAccessor(normals);
    json.meshes.push({ primitives: [{ attributes: { POSITION: posAcc, NORMAL: normAcc }, mode: 4 }] });
    json.nodes.push({ mesh: json.meshes.length - 1, name: mesh.name || `Object${i + 1}` });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  });

  json.buffers.push({ byteLength: offset });

  const pad = (arr, to, filler) => {
    const rem = arr.byteLength % 4;
    if (rem === 0) return arr;
    const out = new Uint8Array(arr.byteLength + (4 - rem)).fill(filler);
    out.set(arr, 0);
    return out;
  };
  const jsonChunk = pad(strToU8(JSON.stringify(json)), 4, 0x20);
  let bin = new Uint8Array(offset);
  let bo = 0;
  for (const c of chunks) { bin.set(c, bo); bo += c.byteLength; }
  bin = pad(bin, 4, 0);

  const total = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength;
  const glb = new ArrayBuffer(total);
  const dv = new DataView(glb);
  const u8 = new Uint8Array(glb);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonChunk.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  u8.set(jsonChunk, 20);
  const binStart = 20 + jsonChunk.byteLength;
  dv.setUint32(binStart, bin.byteLength, true);
  dv.setUint32(binStart + 4, 0x004e4942, true); // "BIN"
  u8.set(bin, binStart + 8);
  return glb;
}

// ---- 3MF — modern 3D printing format (zipped XML) ----
export function export3MF(meshes, unit = 'mm') {
  const coordinateScale = unit === 'in' ? 2 : 50.8;
  const modelUnit = unit === 'in' ? 'inch' : 'millimeter';
  let objects = '';
  let items = '';
  let id = 1;
  for (const mesh of meshes) {
    const tris = worldTriangles(mesh);
    if (tris.length === 0) continue;
    const index = new Map();
    let verts = '';
    const vid = (v) => {
      const x = v.x * coordinateScale;
      const y = v.y * coordinateScale;
      const z = v.z * coordinateScale;
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      let i = index.get(key);
      if (i === undefined) {
        i = index.size;
        index.set(key, i);
        verts += `<vertex x="${x.toFixed(6)}" y="${y.toFixed(6)}" z="${z.toFixed(6)}"/>`;
      }
      return i;
    };
    let faces = '';
    for (const t of tris) faces += `<triangle v1="${vid(t.a)}" v2="${vid(t.b)}" v3="${vid(t.c)}"/>`;
    objects += `<object id="${id}" type="model"><mesh><vertices>${verts}</vertices><triangles>${faces}</triangles></mesh></object>`;
    items += `<item objectid="${id}"/>`;
    id++;
  }

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${modelUnit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects}</resources><build>${items}</build></model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
}