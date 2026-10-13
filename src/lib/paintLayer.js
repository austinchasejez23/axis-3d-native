import * as THREE from 'three';

// Surface paint layer.
//
// Brush and spray strokes are no longer stored as per-vertex colors (which made
// every stroke pixelated and dependent on how dense the mesh was). Each painted
// object owns an RGBA paint atlas: a 2048² texture split into six tiles, one per
// box direction (+X −X +Y −Y +Z −Z). Every face is mapped into the tile facing
// its normal, so painting resolves to the texture's resolution — not the mesh's
// vertex count — and the wireframe/grid never shows through a stroke.
//
// A dab is rasterized straight into the atlas on the CPU: for each face inside
// the brush radius, every texel of that face's triangle is reconstructed in 3D
// and colored by its true distance to the touched point. Because the distance
// test is done in 3D, a stroke runs seamlessly across face boundaries and around
// corners onto neighboring faces, exactly like projection painting.
//
// Pixels are stored PREMULTIPLIED so bilinear filtering never produces dark
// fringes; the material shader (applyPaintLayerShader) un-premultiplies, decodes
// sRGB and blends the layer over whatever the surface already shows.

export const PAINT_ATLAS_SIZE = 2048;
const COLS = 3, ROWS = 2;
const INSET = 3;     // texels of padding so filtering never bleeds across tiles
const BLOCK = 64;    // undo snapshot granularity (pixels)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Tile + projection axes for a (local-space) face normal.
function tileForNormal(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return { tile: n.x >= 0 ? 0 : 1, ua: 'z', va: 'y' };
  if (ay >= az) return { tile: n.y >= 0 ? 2 : 3, ua: 'x', va: 'z' };
  return { tile: n.z >= 0 ? 4 : 5, ua: 'x', va: 'y' };
}

function tileFrame(layer, t) {
  const col = t.tile % COLS, row = Math.floor(t.tile / COLS);
  return { x0: col * layer.tileW, y0: row * layer.tileH, innerW: layer.tileW - 2 * INSET, innerH: layer.tileH - 2 * INSET };
}

// Atlas pixel position of a local-space point inside a tile.
function pixelOf(layer, t, frame, v, clamp) {
  const { bmin, bsize } = layer.bounds;
  let fu = (v[t.ua] - bmin[t.ua]) / bsize[t.ua];
  let fv = (v[t.va] - bmin[t.va]) / bsize[t.va];
  if (clamp) { fu = clamp01(fu); fv = clamp01(fv); }
  return [frame.x0 + INSET + fu * frame.innerW, frame.y0 + INSET + fv * frame.innerH];
}

function meshBounds(mesh) {
  const bmin = { x: Infinity, y: Infinity, z: Infinity };
  const bmax = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of mesh.vertices) {
    bmin.x = Math.min(bmin.x, v.x); bmin.y = Math.min(bmin.y, v.y); bmin.z = Math.min(bmin.z, v.z);
    bmax.x = Math.max(bmax.x, v.x); bmax.y = Math.max(bmax.y, v.y); bmax.z = Math.max(bmax.z, v.z);
  }
  if (!Number.isFinite(bmin.x)) return { bmin: { x: 0, y: 0, z: 0 }, bsize: { x: 1, y: 1, z: 1 } };
  return {
    bmin,
    bsize: { x: Math.max(1e-6, bmax.x - bmin.x), y: Math.max(1e-6, bmax.y - bmin.y), z: Math.max(1e-6, bmax.z - bmin.z) },
  };
}

function makeLayer(size, bounds) {
  const data = new Uint8Array(size * size * 4);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return {
    size, tileW: size / COLS, tileH: size / ROWS, bounds, data, texture,
    stamp: new Uint8Array(size * size), stampId: 0,
    painted: false, version: 0, _serialized: null, _serializedVersion: -1,
  };
}

export function createPaintLayer(mesh) {
  return makeLayer(PAINT_ATLAS_SIZE, meshBounds(mesh));
}

// Wipes every painted pixel back to fully transparent — "Remove paint".
export function clearPaintLayer(layer) {
  if (!layer?.painted) return false;
  layer.data.fill(0);
  layer.texture.needsUpdate = true;
  layer.painted = false;
  layer.version++;
  layer._serialized = null;
  return true;
}

// Deep copy for the Clone / Mirror tools, so the copy is painted independently.
export function clonePaintLayer(layer) {
  if (!layer) return null;
  const copy = makeLayer(layer.size, { bmin: { ...layer.bounds.bmin }, bsize: { ...layer.bounds.bsize } });
  copy.data.set(layer.data);
  copy.painted = layer.painted;
  copy.texture.needsUpdate = true;
  return copy;
}

// Per-corner atlas UVs, in the same polygon-triangulation order used by
// EditableMesh.toBufferGeometry (including concave Boolean faces).
export function buildPaintUvs(mesh) {
  const layer = mesh.paintLayer;
  const uvs = [];
  const inv = 1 / layer.size;
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    const t = tileForNormal(mesh.getFaceNormal(fi));
    const frame = tileFrame(layer, t);
    for (const tri of mesh.getFaceTriangleIndices(fi)) {
      for (const vi of tri) {
        const [px, py] = pixelOf(layer, t, frame, mesh.getVertex(face[vi]), true);
        uvs.push(px * inv, py * inv);
      }
    }
  }
  return uvs;
}

// ── Undo support: strokes remember the pixels they overwrite in 64px blocks ──

export function beginPaintStroke(screenRadius) {
  return { screenRadius, layers: new Map() };
}

function readRect(layer, x, y, w, h) {
  w = Math.min(w, layer.size - x); h = Math.min(h, layer.size - y);
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * layer.size + x) * 4;
    out.set(layer.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { x, y, w, h, data: out };
}

function markChanged(layer) {
  layer.texture.needsUpdate = true;
  layer.painted = true;
  layer.version++;
}

function writeRect(layer, p) {
  for (let row = 0; row < p.h; row++) {
    const dst = ((p.y + row) * layer.size + p.x) * 4;
    layer.data.set(p.data.subarray(row * p.w * 4, (row + 1) * p.w * 4), dst);
  }
  markChanged(layer);
}

function saveBlocks(stroke, meshId, layer, x0, y0, x1, y1) {
  let entry = stroke.layers.get(meshId);
  if (!entry) { entry = { blocks: new Map() }; stroke.layers.set(meshId, entry); }
  const per = Math.ceil(layer.size / BLOCK);
  for (let by = Math.floor(y0 / BLOCK); by <= Math.floor(y1 / BLOCK); by++) {
    for (let bx = Math.floor(x0 / BLOCK); bx <= Math.floor(x1 / BLOCK); bx++) {
      const key = by * per + bx;
      if (entry.blocks.has(key)) continue;
      entry.blocks.set(key, readRect(layer, bx * BLOCK, by * BLOCK, BLOCK, BLOCK));
    }
  }
}

// The "before" pixels of everything a stroke touched → attached to its undo step.
export function finishPaintStroke(stroke) {
  const patches = [];
  for (const [meshId, entry] of stroke.layers) {
    for (const b of entry.blocks.values()) patches.push({ meshId, ...b });
  }
  return patches;
}

// Current pixels of the same rects (the inverse patch, used for redo).
export function capturePaintPatches(sm, patches) {
  const out = [];
  for (const p of patches) {
    const layer = sm.getMesh(p.meshId)?.paintLayer;
    if (layer) out.push({ meshId: p.meshId, ...readRect(layer, p.x, p.y, p.w, p.h) });
  }
  return out;
}

export function applyPaintPatches(sm, patches) {
  for (const p of patches) {
    const layer = sm.getMesh(p.meshId)?.paintLayer;
    if (layer) writeRect(layer, p);
  }
}

// ── Painting ────────────────────────────────────────────────────────────────

// center/normal are in the mesh's LOCAL space, radius in local units.
// softness 0 = hard disc, 1 = fades from the very center. faces = Set of face
// indices allowed to receive paint (null = every face).
export function paintDab(layer, mesh, { meshId, stroke, center, normal, radius, color, opacity, softness, faces, influenceEdges }) {
  const { size, data, stamp, bounds } = layer;
  // One stamp id per dab: a texel on an edge shared by two triangles is only
  // blended once, so shared edges never show up as darker seam lines.
  layer.stampId = (layer.stampId % 250) + 1;
  if (layer.stampId === 1) stamp.fill(0);
  const stampId = layer.stampId;
  const r2 = radius * radius;
  const cr = (color >> 16) & 255, cg = (color >> 8) & 255, cb = color & 255;
  const solid = 1 - softness;
  let changed = false;
  const n = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const edgePoint = new THREE.Vector3();
  const edgeDelta = new THREE.Vector3();
  const edgeFadeAt = (x, y, z, faceIndex) => {
    if (!influenceEdges?.length) return 1;
    sample.set(x, y, z);
    let strongest = 0;
    for (const { a, b, radius: edgeRadius, faces: edgeFaces } of influenceEdges) {
      if (edgeFaces && !edgeFaces.has(faceIndex)) continue;
      edgePoint.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len2 = edgePoint.lengthSq();
      const t = len2 > 1e-12 ? clamp01(edgeDelta.set(x - a.x, y - a.y, z - a.z).dot(edgePoint) / len2) : 0;
      edgePoint.set(a.x + edgePoint.x * t, a.y + edgePoint.y * t, a.z + edgePoint.z * t);
      strongest = Math.max(strongest, 1 - sample.distanceTo(edgePoint) / (edgeRadius ?? radius));
    }
    return clamp01(strongest);
  };

  // Restricted fills/strokes visit only their target faces. Iterating every
  // face made edge fill scale with the entire mesh even when two faces were
  // selected.
  const faceIndices = faces ? Array.from(faces) : null;
  const faceCount = faceIndices ? faceIndices.length : mesh.faces.length;
  for (let facePos = 0; facePos < faceCount; facePos++) {
    const fi = faceIndices ? faceIndices[facePos] : facePos;
    const face = mesh.faces[fi];
    if (face.length < 3) continue;
    let bad = false;
    const verts = new Array(face.length);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < face.length; i++) {
      const v = mesh.getVertex(face[i]);
      if (!v) { bad = true; break; }
      verts[i] = v; cx += v.x; cy += v.y; cz += v.z;
    }
    if (bad) continue;
    cx /= face.length; cy /= face.length; cz /= face.length;
    let fr = 0;
    for (const v of verts) fr = Math.max(fr, Math.hypot(v.x - cx, v.y - cy, v.z - cz));
    if (Math.hypot(center.x - cx, center.y - cy, center.z - cz) > radius + fr) continue;
    n.copy(mesh.getFaceNormal(fi));
    // Faces turned away from the touched surface (the far side of a thin
    // plate) are never painted through.
    if (n.dot(normal) < -0.15) continue;
    const t = tileForNormal(n);
    const frame = tileFrame(layer, t);
    const [pcx, pcy] = pixelOf(layer, t, frame, center, false);
    const prx = (radius / bounds.bsize[t.ua]) * frame.innerW;
    const pry = (radius / bounds.bsize[t.va]) * frame.innerH;
    const tileX1 = frame.x0 + layer.tileW - 1, tileY1 = frame.y0 + layer.tileH - 1;

    for (let k = 1; k < face.length - 1; k++) {
      const A = verts[0], B = verts[k], C = verts[k + 1];
      const [ax, ay] = pixelOf(layer, t, frame, A, true);
      const [bx, by] = pixelOf(layer, t, frame, B, true);
      const [qx, qy] = pixelOf(layer, t, frame, C, true);
      const minX = Math.max(Math.ceil(frame.x0), Math.floor(Math.min(ax, bx, qx)), Math.floor(pcx - prx));
      const maxX = Math.min(Math.floor(tileX1), Math.ceil(Math.max(ax, bx, qx)), Math.ceil(pcx + prx));
      const minY = Math.max(Math.ceil(frame.y0), Math.floor(Math.min(ay, by, qy)), Math.floor(pcy - pry));
      const maxY = Math.min(Math.floor(tileY1), Math.ceil(Math.max(ay, by, qy)), Math.ceil(pcy + pry));
      if (minX > maxX || minY > maxY) continue;
      const det = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay);
      if (Math.abs(det) < 1e-9) continue;
      if (stroke) saveBlocks(stroke, meshId, layer, minX, minY, maxX, maxY);
      for (let py = minY; py <= maxY; py++) {
        const y = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const si = py * size + px;
          if (stamp[si] === stampId) continue;
          const x = px + 0.5;
          // Cheap 2D reject before the barycentric / 3D distance work: the
          // projected brush is an ellipse in tile space.
          const ex = (x - pcx) / prx, ey = (y - pcy) / pry;
          if (ex * ex + ey * ey > 1.05) continue;
          const l1 = ((bx - x) * (qy - y) - (qx - x) * (by - y)) / det;
          const l2 = ((qx - x) * (ay - y) - (ax - x) * (qy - y)) / det;
          const l3 = 1 - l1 - l2;
          // A hair of tolerance keeps texels that straddle an edge covered.
          if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
          const X = A.x * l1 + B.x * l2 + C.x * l3;
          const Y = A.y * l1 + B.y * l2 + C.y * l3;
          const Z = A.z * l1 + B.z * l2 + C.z * l3;
          const dx = X - center.x, dy = Y - center.y, dz = Z - center.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          stamp[si] = stampId;
          const nd = Math.sqrt(d2) / radius;
          const w = softness <= 0 || nd <= solid ? 1 : Math.max(0, (1 - nd) / softness);
          // Edge mode adds a separate perpendicular falloff from each selected
          // edge. The strongest individual influence wins, so overlapping edge
          // fades stay even instead of accumulating into dark seams.
          const s = opacity * w * edgeFadeAt(X, Y, Z, fi);
          if (s <= 0) continue;
          const keep = 1 - s;
          const i = si * 4;
          data[i] = data[i] * keep + cr * s + 0.5;
          data[i + 1] = data[i + 1] * keep + cg * s + 0.5;
          data[i + 2] = data[i + 2] * keep + cb * s + 0.5;
          data[i + 3] = data[i + 3] * keep + 255 * s + 0.5;
          changed = true;
        }
      }
    }
  }
  if (changed) markChanged(layer);
  return changed;
}

// ── Material hookup ─────────────────────────────────────────────────────────

// Blends the paint layer over the material's surface color (after vertex/face
// fill colors and any texture map), so strokes always sit on top.
export function applyPaintLayerShader(material, texture) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.userData.axisPaintTexture = texture;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    shader.uniforms.axisPaintMap = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 paintUv;\nvarying vec2 vAxisPaintUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAxisPaintUv = paintUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D axisPaintMap;\nvarying vec2 vAxisPaintUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
vec4 axisPaint = texture2D(axisPaintMap, vAxisPaintUv);
if (axisPaint.a > 0.002) {
  vec3 axisPaintRgb = pow(axisPaint.rgb / axisPaint.a, vec3(2.2));
  diffuseColor.rgb = mix(diffuseColor.rgb, axisPaintRgb, axisPaint.a);
}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|axis-paint-layer-v1`;
}

// ── Persistence (projects) ──────────────────────────────────────────────────

export function serializePaintLayer(layer) {
  if (layer._serialized && layer._serializedVersion === layer.version) return layer._serialized;
  const { size, data } = layer;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const out = img.data;
  // Canvas pixels are straight alpha: un-premultiply before encoding.
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const f = 255 / a;
    out[i] = Math.min(255, data[i] * f);
    out[i + 1] = Math.min(255, data[i + 1] * f);
    out[i + 2] = Math.min(255, data[i + 2] * f);
    out[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  layer._serialized = {
    size,
    bounds: { bmin: { ...layer.bounds.bmin }, bsize: { ...layer.bounds.bsize } },
    image: canvas.toDataURL('image/png'),
  };
  layer._serializedVersion = layer.version;
  return layer._serialized;
}

export function deserializePaintLayer(saved) {
  if (!saved || !saved.image || !saved.bounds) return null;
  const layer = makeLayer(saved.size || PAINT_ATLAS_SIZE, saved.bounds);
  layer.painted = true;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = layer.size; canvas.height = layer.size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, layer.size, layer.size);
    const src = ctx.getImageData(0, 0, layer.size, layer.size).data;
    const data = layer.data;
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3] / 255;
      data[i] = src[i] * a + 0.5;
      data[i + 1] = src[i + 1] * a + 0.5;
      data[i + 2] = src[i + 2] * a + 0.5;
      data[i + 3] = src[i + 3];
    }
    layer.texture.needsUpdate = true;
  };
  img.src = saved.image;
  return layer;
}