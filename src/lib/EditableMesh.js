import * as THREE from 'three';
import { buildPaintUvs, serializePaintLayer, deserializePaintLayer } from './paintLayer';
import { edgeKey } from './meshTopology';
import { splitFaceBetween } from './cutTools';

let nextId = 1;
const genId = () => nextId++;

export class EditableMesh {
  constructor(name = 'Object') {
    this.id = genId();
    this.name = name;
    this.vertices = [];
    this.faces = [];
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.visible = true;
    this.locked = false;
    this.color = 0xaeb4bc;
    this.primitiveType = null;
    this.segments = null;
    this.smoothShading = false;
    this.clearCoatEnabled = false;
    this.clearCoatIntensity = 0.5;
    this.material = null;
    this.mapTexture = null;     // runtime THREE.Texture (session only)
    this.textureUrl = null;     // runtime image URL (session only)
    this.referenceUrl = null;   // persistent, uploaded image for a reference plane
    this.textureTransform = { scale: 1, rotation: 0, mirror: false };
    this.uvMode = 'box';        // texture projection: box | planar | cylindrical | spherical
    this.reflectionEnabled = false;     // real-time scene reflections on/off
    this.reflectionIntensity = 0.6;    // 0–1, controls reflected-env visibility
    this.reflectionRoughness = 0.1;    // 0–1, controls reflection clarity/blur
    this.roughness = null;             // base PBR roughness override (null = preset)
    this.metalness = null;             // base PBR metalness override (null = preset)
    this.opacity = 1;                  // 0–1 surface opacity
    this.emissive = 0;                 // 0–1 self-illumination (glow)
    this.tintHue = 0;
    this.tintAmount = 0;
    this.chamEnabled = false;
    this.chamPrimary = '#ff0000';
    this.chamSecondary = '#00aaff';
    this.chamIntensity = 0;
    this.vertexColors = {};
    this.faceColors = {};
    this.paintLayer = null;     // surface paint atlas (brush / spray strokes)
    this.paintWireEdges = null;
    this.explicitEdges = [];
    this.hiddenEdges = [];      // edges deleted in edge mode: hidden from the
                                // wireframe while their faces stay intact
    this.visibleEdges = [];     // edges locked as VISIBLE. Every edge is
                                // classified exactly once — the first time it is
                                // rendered, while its geometry is pristine —
                                // and the verdict is permanent: a diagonal goes
                                // into hiddenEdges forever, a real edge goes in
                                // here forever. Later deformations can never
                                // reveal a diagonal or hide a real line.
    this._edgeCache = null;
    this._edgeFaceMap = null;
    this._vertexFaceMap = null;
    this._vertexMap = null;
    this._vertexMapCount = -1;
  }

  resetSurfaceAppearance() {
    if (this.mapTexture) this.mapTexture.dispose();
    this.color = 0xaeb4bc;
    this.smoothShading = false;
    this.clearCoatEnabled = false;
    this.clearCoatIntensity = 0.5;
    this.material = null;
    this.mapTexture = null;
    this.textureUrl = null;
    this.textureTransform = { scale: 1, rotation: 0, mirror: false };
    this.uvMode = 'box';
    this.reflectionEnabled = false;
    this.reflectionIntensity = 0.6;
    this.reflectionRoughness = 0.1;
    this.roughness = null;
    this.metalness = null;
    this.opacity = 1;
    this.emissive = 0;
    this.tintHue = 0;
    this.tintAmount = 0;
    this.chamEnabled = false;
    this.chamPrimary = '#ff0000';
    this.chamSecondary = '#00aaff';
    this.chamIntensity = 0;
    this.vertexColors = {};
    this.faceColors = {};
    this.paintLayer = null;
    return this;
  }

  static fromGeometry(geometry, name) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const pos = geo.attributes.position;
    const mesh = new EditableMesh(name);
    const posMap = new Map();
    const triIdx = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // Snap to a 1e-5 grid (and normalize -0 → 0) so seam vertices that three.js
      // emits at theta=0 and theta=2π (which differ only by ~1e-16) merge into one.
      // Without this, cylinders/tubes ship with an open side seam.
      const snap = (n) => Math.round(n * 1e5) / 1e5;
      const key = `${snap(x)},${snap(y)},${snap(z)}`;
      let vid = posMap.get(key);
      if (vid === undefined) {
        const v = { id: genId(), x, y, z };
        mesh.vertices.push(v);
        vid = v.id;
        posMap.set(key, vid);
      }
      triIdx.push(vid);
    }
    for (let i = 0; i < triIdx.length; i += 3) {
      mesh.faces.push([triIdx[i], triIdx[i + 1], triIdx[i + 2]]);
    }
    geo.dispose();
    return mesh;
  }

  _ensureEdgeFaceMap() {
    if (this._edgeFaceMap) return this._edgeFaceMap;
    const map = new Map();
    for (let i = 0; i < this.faces.length; i++) {
      const face = this.faces[i];
      for (let j = 0; j < face.length; j++) {
        const a = face[j], b = face[(j + 1) % face.length];
        const key = edgeKey(a, b);
        if (!map.has(key)) map.set(key, { v1: Math.min(a, b), v2: Math.max(a, b), faces: [] });
        map.get(key).faces.push(i);
      }
    }
    this._edgeFaceMap = map;
    return map;
  }

  getEdges() {
    if (this._edgeCache) return this._edgeCache;
    const hidden = this._hiddenEdgeMap();
    const map = this._ensureEdgeFaceMap();
    this._edgeCache = [];
    const addedKeys = new Set();
    const visible = this._visibleEdgeSet();
    for (const e of map.values()) {
      const key = `${e.v1},${e.v2}`;
      if (hidden.has(key) && this._hiddenApplies(hidden.get(key), e.faces)) continue;
      // One-time permanent classification: an edge never seen before is judged
      // NOW (while its geometry is fresh) and the verdict is locked — diagonal
      // edges go into hiddenEdges forever, real edges into visibleEdges forever.
      // Deforming the mesh later can never flip either verdict.
      if (e.faces.length === 2 && !visible.has(key)) {
        if (this.edgeIsTriangulationDiagonal(e.v1, e.v2, e.faces[0], e.faces[1])) {
          this.hiddenEdges.push({ v1: e.v1, v2: e.v2 });
          continue;
        }
        this.visibleEdges.push({ v1: e.v1, v2: e.v2 });
        visible.add(key);
      }
      this._edgeCache.push({ v1: e.v1, v2: e.v2 });
      addedKeys.add(key);
    }
    for (const e of this.explicitEdges) {
      const key = `${Math.min(e.v1, e.v2)},${Math.max(e.v1, e.v2)}`;
      if (hidden.has(key)) continue;
      if (!addedKeys.has(key) && this.getVertex(e.v1) && this.getVertex(e.v2)) {
        this._edgeCache.push({ v1: e.v1, v2: e.v2 });
        addedKeys.add(key);
      }
    }
    return this._edgeCache;
  }

  invalidateCache() { this._edgeCache = null; this._edgeFaceMap = null; this._vertexFaceMap = null; this._vertexMap = null; }

  _visibleEdgeSet() {
    const s = new Set();
    for (const e of this.visibleEdges) s.add(`${Math.min(e.v1, e.v2)},${Math.max(e.v1, e.v2)}`);
    return s;
  }

  // hiddenEdges as key → wasUserDeleted map.
  _hiddenEdgeMap() {
    const m = new Map();
    for (const h of this.hiddenEdges) {
      const k = `${Math.min(h.v1, h.v2)},${Math.max(h.v1, h.v2)}`;
      m.set(k, m.get(k) || !!h.user || !!h.locked);
    }
    return m;
  }

  // Self-heal: an AUTO-hidden entry on an edge between two faces where either
  // is an n-gon was mis-baked by the old classifier — n-gon edges are always
  // real, so ignore the stale hide. Explicit user deletions are always honored.
  _hiddenApplies(isUser, faceIdxs) {
    if (isUser) return true;
    if (faceIdxs && faceIdxs.length === 2 &&
        (this.faces[faceIdxs[0]].length > 3 || this.faces[faceIdxs[1]].length > 3)) return false;
    return true;
  }

  // Freeze the CURRENT set of quad triangulation diagonals into hiddenEdges.
  // The diagonal test is geometric (longest side / coplanar), so once a quad is
  // folded by a rotate/scale/move its diagonal would start rendering as a stray
  // line. Locking them before a deformation keeps them hidden permanently.
  lockTriangulationDiagonals() {
    // Entries baked earlier by the lazy classifier carry no flag, so the n-gon
    // self-heal could still ignore them once a neighbouring face gains a
    // vertex. Locking them here makes every existing hide permanent.
    for (const h of this.hiddenEdges) h.locked = true;
    const map = this._ensureEdgeFaceMap();
    const existing = new Set(this.hiddenEdges.map(h => `${Math.min(h.v1, h.v2)},${Math.max(h.v1, h.v2)}`));
    const visible = this._visibleEdgeSet();
    for (const e of map.values()) {
      if (e.faces.length !== 2) continue;
      const k = `${e.v1},${e.v2}`;
      if (existing.has(k)) continue;
      // Never hide an edge already locked as visible.
      if (visible.has(k)) continue;
      if (this.edgeIsTriangulationDiagonal(e.v1, e.v2, e.faces[0], e.faces[1])) {
        // locked:true = permanent. Cuts thread new vertices into neighbouring
        // triangles, turning them into polygons; without this flag the n-gon
        // self-heal would ignore the hide and the diagonal would reappear.
        this.hiddenEdges.push({ v1: e.v1, v2: e.v2, locked: true });
        existing.add(k);
      }
    }
    this.invalidateCache();
  }

  // The third vertex of a triangle face that isn't v1 or v2.
  _edgeThirdVertex(face, v1, v2) {
    for (const vid of face) if (vid !== v1 && vid !== v2) return vid;
    return null;
  }

  // A coplanar internal edge is a triangulation diagonal (hide it) when it is
  // the longest of the quad's five segments — i.e. it spans a subdivided quad
  // rather than running along the segmentation grid. Lets segment grid lines
  // render while hiding triangulation diagonals.
  edgeIsTriangulationDiagonal(v1, v2, f0, f1) {
    // Only TRIANGLE pairs can carry a triangulation diagonal. Polygon (n-gon)
    // faces — bevel bands, created faces — store their outline directly, so
    // every edge between them is a real edge and must never be hidden. Running
    // the geometric test on n-gons ate real wireframe lines on flat stretches.
    if (this.faces[f0].length > 3 || this.faces[f1].length > 3) return false;
    const a = this.getVertex(v1), b = this.getVertex(v2);
    const cId = this._edgeThirdVertex(this.faces[f0], v1, v2);
    const dId = this._edgeThirdVertex(this.faces[f1], v1, v2);
    if (!a || !b || cId == null || dId == null) return false;
    const c = this.getVertex(cId), d = this.getVertex(dId);
    const len = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    const ab = len(a, b);
    // The diagonal of a quad (two triangles sharing this edge) is hidden when
    // it spans the quad — i.e. it is the longest of the quad's five segments.
    // This keeps the diagonal hidden even after a vertex is moved and the quad
    // is no longer a perfect parallelogram (the prior opposite-sides-equal test
    // re-exposed the diagonal on any deformation). Radial fan edges
    // (cone/cylinder cap, sphere pole) are NOT the longest — they tie with
    // neighboring radials — so they stay visible and the cap grid is preserved.
    // Use an epsilon so edges that only TIE for longest (fan radials around a
    // cap/pole, which are all equal length) are NOT treated as diagonals —
    // without it, floating-point noise hides some radials and not others,
    // making the cap segments uneven. A true quad diagonal is longest by a
    // clear margin, so eps never misclassifies it.
    const eps = 1e-4;
    const longest = ab > len(a, c) + eps && ab > len(a, d) + eps && ab > len(b, c) + eps && ab > len(b, d) + eps;
    if (longest) return true;
    // Not the longest segment: the quad may have been deformed (e.g. an edge of
    // a cube was moved) so the diagonal is no longer the longest side, but the
    // two triangles are still coplanar — a flat quad whose triangulation
    // diagonal is still an artifact and should stay hidden. Fan radials
    // (cone/sphere cap pole) are also coplanar, so exclude edges whose endpoint
    // is a fan center (≥3 incident coplanar triangles) to keep those visible.
    const n0 = this.getFaceNormal(f0);
    const n1 = this.getFaceNormal(f1);
    if (n0.dot(n1) <= 0.9995) return false;
    if (this._isFanCenter(v1, f0, n0) || this._isFanCenter(v2, f0, n0)) return false;
    return true;
  }

  _ensureVertexFaceMap() {
    if (this._vertexFaceMap) return this._vertexFaceMap;
    const m = new Map();
    for (let fi = 0; fi < this.faces.length; fi++) {
      for (const vid of this.faces[fi]) {
        let arr = m.get(vid);
        if (!arr) { arr = []; m.set(vid, arr); }
        arr.push(fi);
      }
    }
    this._vertexFaceMap = m;
    return m;
  }

  // A fan center is a vertex with ≥3 incident triangles coplanar with refFace
  // (cone/sphere cap pole). Used to keep fan radials visible while hiding flat
  // quad diagonals.
  _isFanCenter(vid, refFaceIdx, refNormal) {
    const map = this._ensureVertexFaceMap();
    const incident = map.get(vid);
    if (!incident || incident.length < 3) return false;
    let count = 0;
    for (const fi of incident) {
      if (this.getFaceNormal(fi).dot(refNormal) > 0.9995) count++;
      if (count >= 3) return true;
    }
    return false;
  }

  // Vertex id → vertex object index. Every geometry build looks a vertex up
  // once per face corner, so a linear scan made the cost grow with
  // (faces × vertices) — the reason dense meshes crawled. The index is rebuilt
  // whenever the vertex array changes length OR is swapped for a different
  // array (undo/restore), so a stale entry can never be handed out.
  _vertexIndex() {
    const n = this.vertices.length;
    const map = this._vertexMap;
    if (map && this._vertexMapCount === n && (n === 0 || map.get(this.vertices[0].id) === this.vertices[0])) return map;
    const next = new Map();
    for (const v of this.vertices) next.set(v.id, v);
    this._vertexMap = next;
    this._vertexMapCount = n;
    return next;
  }

  getVertex(id) {
    const v = this._vertexIndex().get(id);
    if (v !== undefined) return v;
    // Miss: the array was mutated in place (ids added/removed without a length
    // or identity change). Rebuild once, then answer definitively.
    this._vertexMap = null;
    return this._vertexIndex().get(id);
  }

  getVertexVector(id) {
    const v = this.getVertex(id);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  translateVertexIds(ids, delta) {
    const set = new Set(ids);
    for (const v of this.vertices) {
      if (set.has(v.id)) {
        v.x += delta.x; v.y += delta.y; v.z += delta.z;
      }
    }
  }

  getEdgeVertexIds(edgeIdx) {
    const edges = this.getEdges();
    const e = edges[edgeIdx];
    return [e.v1, e.v2];
  }

  getFaceVertexIds(faceIdx) { return this.faces[faceIdx]; }

  // Map a rendered buffer-triangle index (from a Raycaster hit's faceIndex,
  // which counts each n-gon's fan triangles) back to the index of the source
  // face in this.faces. Without this, n-gon faces (e.g. Create-Face-by-Border
  // output) can't be selected because their buffer triangle index doesn't
  // equal their mesh face index.
  getFaceIndexFromTriangle(triIdx) {
    let t = 0;
    for (let fi = 0; fi < this.faces.length; fi++) {
      const triCount = this.getFaceTriangleIndices(fi).length;
      if (triIdx - t < triCount) return fi;
      t += triCount;
    }
    return Math.max(0, this.faces.length - 1);
  }

  getFaceCenter(faceIdx) {
    const vids = this.faces[faceIdx];
    const c = new THREE.Vector3();
    for (const vid of vids) {
      const v = this.getVertex(vid);
      c.add(new THREE.Vector3(v.x, v.y, v.z));
    }
    return c.divideScalar(vids.length);
  }

  getFaceNormal(faceIdx) {
    const vids = this.faces[faceIdx];
    // The first three vertices may be collinear after Boolean boundary
    // stitching. Compute the normal from the entire polygon instead.
    const result = new THREE.Vector3();
    for (let i = 0; i < vids.length; i++) {
      const p = this.getVertex(vids[i]), q = this.getVertex(vids[(i + 1) % vids.length]);
      result.x += (p.y - q.y) * (p.z + q.z);
      result.y += (p.z - q.z) * (p.x + q.x);
      result.z += (p.x - q.x) * (p.y + q.y);
    }
    if (result.lengthSq() < 1e-22) {
      const a = this.getVertexVector(vids[0]), b = this.getVertexVector(vids[1]), c = this.getVertexVector(vids[2]);
      return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    }
    return result.normalize();
  }

  // Triangle indices into the ACTUAL polygon boundary. A plain [0,i,i+1] fan
  // crosses outside a concave face, drawing a blade that juts past the
  // outline. Both candidates are measured in the face's own plane: whichever
  // tiles the outline with no spare area wins. These triangles are for
  // drawing only and never add an editable face edge.
  getFaceTriangleIndices(faceIdx) {
    const face = this.faces[faceIdx];
    if (face.length < 3) return [];
    if (face.length === 3) return [[0, 1, 2]];
    const pts = face.map((id) => this.getVertexVector(id));
    const normal = this.getFaceNormal(faceIdx);
    const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
    const flat = pts.map((p) => ax >= ay && ax >= az ? new THREE.Vector2(p.y, p.z)
      : ay >= az ? new THREE.Vector2(p.z, p.x) : new THREE.Vector2(p.x, p.y));
    let outline = 0;
    for (let i = 0; i < flat.length; i++) {
      const p = flat[i], q = flat[(i + 1) % flat.length];
      outline += p.x * q.y - q.x * p.y;
    }
    outline /= 2;
    const turn = outline < 0 ? -1 : 1;
    const span = (t) => ((flat[t[1]].x - flat[t[0]].x) * (flat[t[2]].y - flat[t[0]].y)
      - (flat[t[1]].y - flat[t[0]].y) * (flat[t[2]].x - flat[t[0]].x)) * turn / 2;
    // Spare area: how much of a triangulation lands outside the outline or on
    // top of itself. Zero means the triangles tile the face and nothing juts.
    const spare = (tris) => {
      let total = 0;
      for (const t of tris) total += Math.abs(span(t));
      return total - Math.abs(outline);
    };
    const fan = [];
    for (let i = 1; i < pts.length - 1; i++) fan.push([0, i, i + 1]);
    const fanSpare = spare(fan);
    if (fanSpare <= Math.abs(outline) * 1e-7 + 1e-18) return fan;
    const clipped = [];
    for (const triangle of THREE.ShapeUtils.triangulateShape(flat, [])) {
      const t = [triangle[0], triangle[1], triangle[2]];
      const a = span(t);
      if (Math.abs(a) < 1e-20) continue;
      clipped.push(a < 0 ? [t[0], t[2], t[1]] : t);
    }
    if (!clipped.length) return fan;
    return spare(clipped) <= fanSpare ? clipped : fan;
  }

  // Flood-fill coplanar triangles connected by shared edges, starting at faceIdx.
  // Makes a quad (two coplanar triangles) selectable as one face.
  getCoplanarFaceGroup(faceIdx, tolerance = 0.9995) {
    if (faceIdx < 0 || faceIdx >= this.faces.length) return [faceIdx];
    const edgeMap = this._ensureEdgeFaceMap();
    const baseNormal = this.getFaceNormal(faceIdx);
    const visited = new Set([faceIdx]);
    const stack = [faceIdx];
    const result = [faceIdx];
    while (stack.length) {
      const cur = stack.pop();
      const f = this.faces[cur];
      for (let j = 0; j < f.length; j++) {
        const neighbors = edgeMap.get(edgeKey(f[j], f[(j + 1) % f.length]))?.faces || [];
        for (const n of neighbors) {
          if (visited.has(n)) continue;
          if (this.getFaceNormal(n).dot(baseNormal) >= tolerance) {
            // Only merge across a hidden triangulation diagonal (the two tris of
            // one quad). Grid lines and creases are face boundaries, so each
            // segment stays its own selectable face.
            const a = f[j], b = f[(j + 1) % f.length];
            if (!this.edgeIsTriangulationDiagonal(Math.min(a, b), Math.max(a, b), cur, n)) continue;
            visited.add(n);
            result.push(n);
            stack.push(n);
          }
        }
      }
    }
    return result;
  }

  getEdgeCenter(edgeIdx) {
    const [v1, v2] = this.getEdgeVertexIds(edgeIdx);
    const a = this.getVertex(v1), b = this.getVertex(v2);
    return new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }

  getEdgeLength(edgeIdx) {
    const [v1, v2] = this.getEdgeVertexIds(edgeIdx);
    return this.getVertexVector(v1).distanceTo(this.getVertexVector(v2));
  }

  getTriangleCount() {
    let n = 0;
    for (let fi = 0; fi < this.faces.length; fi++) n += this.getFaceTriangleIndices(fi).length;
    return n;
  }

  hasPaint() {
    return Object.keys(this.vertexColors).length > 0 || Object.keys(this.faceColors).length > 0;
  }

  toBufferGeometry() {
    const positions = [];
    const colors = [];
    const normals = [];
    const base = new THREE.Color(this.color);
    // Soft normals are calculated per face-corner, not once per vertex.
    // A vertex can belong to both a curved surface and a hard transition; blindly
    // averaging every incident face bends the normal across that hard edge and
    // produces severe reflection streaks. Only faces inside the smoothing angle
    // contribute to a corner's normal.
    let faceNormals = null;
    let incidentFaces = null;
    const softCos = Math.cos(THREE.MathUtils.degToRad(60));
    if (this.smoothShading) {
      faceNormals = this.faces.map((_, fi) => this.getFaceNormal(fi));
      incidentFaces = new Map();
      for (let fi = 0; fi < this.faces.length; fi++) {
        for (const vid of this.faces[fi]) {
          let list = incidentFaces.get(vid);
          if (!list) { list = []; incidentFaces.set(vid, list); }
          list.push(fi);
        }
      }
    }
    const cornerNormal = (fi, vid) => {
      if (!faceNormals) return null;
      const baseNormal = faceNormals[fi];
      const acc = new THREE.Vector3();
      for (const otherFi of incidentFaces.get(vid) || [fi]) {
        const other = faceNormals[otherFi];
        if (baseNormal.dot(other) >= softCos) acc.add(other);
      }
      return acc.lengthSq() > 1e-12 ? acc.normalize() : baseNormal;
    };
    for (let fi = 0; fi < this.faces.length; fi++) {
      const face = this.faces[fi];
      const faceColor = this.faceColors[fi] ? new THREE.Color(this.faceColors[fi]) : null;
      const fn = faceNormals ? null : this.getFaceNormal(fi);
      for (const tri of this.getFaceTriangleIndices(fi)) {
        for (const vi of tri) {
          const vid = face[vi];
          const v = this.getVertex(vid);
          const color = faceColor || (this.vertexColors[vid] ? new THREE.Color(this.vertexColors[vid]) : base);
          positions.push(v.x, v.y, v.z);
          colors.push(color.r, color.g, color.b);
          const n = faceNormals ? cornerNormal(fi, vid) : fn;
          normals.push(n.x, n.y, n.z);
        }
      }
    }

        // Project UVs per face-corner using the mesh's UV mapping mode (set by
        // the UV tool): box (default), planar, cylindrical, or spherical.
        // Materials without a map ignore the attribute.
        const uvs = [];
        if (this.vertices.length) {
        const bmin = { x: Infinity, y: Infinity, z: Infinity };
        const bmax = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (const v of this.vertices) {
        bmin.x = Math.min(bmin.x, v.x); bmin.y = Math.min(bmin.y, v.y); bmin.z = Math.min(bmin.z, v.z);
        bmax.x = Math.max(bmax.x, v.x); bmax.y = Math.max(bmax.y, v.y); bmax.z = Math.max(bmax.z, v.z);
        }
        const bsize = {
        x: Math.max(1e-6, bmax.x - bmin.x),
        y: Math.max(1e-6, bmax.y - bmin.y),
        z: Math.max(1e-6, bmax.z - bmin.z),
        };
        const mode = this.uvMode || 'box';
        const cx = (bmin.x + bmax.x) / 2, cy = (bmin.y + bmax.y) / 2, cz = (bmin.z + bmax.z) / 2;
        const TWO_PI = Math.PI * 2;
        for (let fi = 0; fi < this.faces.length; fi++) {
        const face = this.faces[fi];
        let ua, va;
        if (mode === 'box') {
          const n = this.getFaceNormal(fi);
          const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
          if (ax >= ay && ax >= az) { ua = 'y'; va = 'z'; }
          else if (ay >= az) { ua = 'x'; va = 'z'; }
          else { ua = 'x'; va = 'y'; }
        }
        // Radial modes unwrap each face's angles around the face's own average
        // angle, so faces crossing the wrap seam don't smear across the image.
        let baseAngle = 0;
        if (mode === 'cylindrical' || mode === 'spherical') {
          let sx = 0, sz = 0;
          for (const vid of face) { const v = this.getVertex(vid); sx += v.x - cx; sz += v.z - cz; }
          baseAngle = Math.atan2(sz, sx);
        }
        const corner = (v) => {
          if (mode === 'planar') return [(v.x - bmin.x) / bsize.x, (v.y - bmin.y) / bsize.y];
          if (mode === 'cylindrical' || mode === 'spherical') {
            let ang = Math.atan2(v.z - cz, v.x - cx);
            while (ang - baseAngle > Math.PI) ang -= TWO_PI;
            while (ang - baseAngle < -Math.PI) ang += TWO_PI;
            const u = ang / TWO_PI + 0.5;
            if (mode === 'cylindrical') return [u, (v.y - bmin.y) / bsize.y];
            const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
            const len = Math.max(1e-6, Math.hypot(dx, dy, dz));
            return [u, Math.acos(Math.max(-1, Math.min(1, -dy / len))) / Math.PI];
          }
          return [(v[ua] - bmin[ua]) / bsize[ua], (v[va] - bmin[va]) / bsize[va]];
        };
        for (const tri of this.getFaceTriangleIndices(fi)) {
          for (const vi of tri) {
            const uv = corner(this.getVertex(face[vi]));
            uvs.push(uv[0], uv[1]);
          }
        }
        }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        if (this.paintLayer) geo.setAttribute('paintUv', new THREE.Float32BufferAttribute(buildPaintUvs(this), 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        return geo;
  }

  // Build a line-segments geometry of only the "real" edges — boundary edges and
  // edges where the two adjacent faces meet at an angle.
  // Coplanar triangulation diagonals (angle 0) are excluded so they don't render.
  toEdgesGeometry() {
    if (this.paintWireEdges?.length) {
      const positions = [];
      for (const edge of this.paintWireEdges) {
        const a = this.getVertex(edge.v1), b = this.getVertex(edge.v2);
        if (a && b) positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return geometry;
    }
    const edgeMap = this._ensureEdgeFaceMap();
    const positions = [];
    const hidden = this._hiddenEdgeMap();
    const shownKeys = new Set();
    const visible = this._visibleEdgeSet();
    for (const { v1, v2, faces } of edgeMap.values()) {
      const key = `${v1},${v2}`;
      if (hidden.has(key) && this._hiddenApplies(hidden.get(key), faces)) continue;
      // Same one-time permanent classification as getEdges: first sighting
      // decides forever. Diagonals never appear, real edges never vanish.
      if (faces.length === 2 && !visible.has(key)) {
        if (this.edgeIsTriangulationDiagonal(v1, v2, faces[0], faces[1])) {
          this.hiddenEdges.push({ v1, v2 });
          continue;
        }
        this.visibleEdges.push({ v1, v2 });
        visible.add(key);
      }
      const va = this.getVertex(v1), vb = this.getVertex(v2);
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      shownKeys.add(key);
    }
    for (const e of this.explicitEdges) {
      const key = `${Math.min(e.v1, e.v2)},${Math.max(e.v1, e.v2)}`;
      if (hidden.has(key) || shownKeys.has(key)) continue;
      const va = this.getVertex(e.v1), vb = this.getVertex(e.v2);
      if (va && vb) {
        positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
        shownKeys.add(key);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  clone() {
    const m = new EditableMesh(this.name);
    m.id = this.id;
    m.vertices = this.vertices.map(v => ({ ...v }));
    m.faces = this.faces.map(f => [...f]);
    m.position.copy(this.position);
    m.rotation.copy(this.rotation);
    m.scale.copy(this.scale);
    m.visible = this.visible;
    m.locked = this.locked;
    m.color = this.color;
    m.primitiveType = this.primitiveType;
    m.segments = this.segments ? { ...this.segments } : null;
    m.primitiveParams = this.primitiveParams ? { ...this.primitiveParams } : null;
    m.smoothShading = this.smoothShading;
    m.clearCoatEnabled = this.clearCoatEnabled;
    m.clearCoatIntensity = this.clearCoatIntensity;
    m.material = this.material ? { ...this.material } : null;
    m.mapTexture = this.mapTexture || null;
    m.textureUrl = this.textureUrl || null;
    m.referenceUrl = this.referenceUrl || null;
    m.textureTransform = { ...this.textureTransform };
    m.uvMode = this.uvMode || 'box';
    m.reflectionEnabled = this.reflectionEnabled;
    m.reflectionIntensity = this.reflectionIntensity;
    m.reflectionRoughness = this.reflectionRoughness;
    m.roughness = this.roughness;
    m.metalness = this.metalness;
    m.opacity = this.opacity;
    m.emissive = this.emissive;
    m.tintHue = this.tintHue;
    m.tintAmount = this.tintAmount;
    m.chamEnabled = this.chamEnabled;
    m.chamPrimary = this.chamPrimary;
    m.chamSecondary = this.chamSecondary;
    m.chamIntensity = this.chamIntensity;
    m.textureMergeColor = this.textureMergeColor;
    m.vertexColors = { ...this.vertexColors };
    m.faceColors = { ...this.faceColors };
    // Shared by reference: undo snapshots revert paint through pixel patches.
    m.paintLayer = this.paintLayer;
    m.paintWireEdges = this.paintWireEdges?.map(e => ({ ...e })) || null;
    m.explicitEdges = this.explicitEdges.map(e => ({ ...e }));
    m.hiddenEdges = this.hiddenEdges.map(e => ({ ...e }));
    m.visibleEdges = this.visibleEdges.map(e => ({ ...e }));
    return m;
  }

  serialize() {
    return {
      id: this.id, name: this.name,
      vertices: this.vertices.map(v => ({ id: v.id, x: v.x, y: v.y, z: v.z })),
      faces: this.faces.map(f => [...f]),
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      rotation: { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z },
      scale: { x: this.scale.x, y: this.scale.y, z: this.scale.z },
      visible: this.visible, locked: this.locked, color: this.color,
      primitiveType: this.primitiveType, segments: this.segments, primitiveParams: this.primitiveParams,
      smoothShading: this.smoothShading,
      clearCoatEnabled: this.clearCoatEnabled,
      clearCoatIntensity: this.clearCoatIntensity,
      material: this.material ? { ...this.material } : null,
      referenceUrl: this.referenceUrl || null,
      uvMode: this.uvMode || 'box',
      reflectionEnabled: this.reflectionEnabled,
      reflectionIntensity: this.reflectionIntensity,
      reflectionRoughness: this.reflectionRoughness,
      roughness: this.roughness,
      metalness: this.metalness,
      opacity: this.opacity,
      emissive: this.emissive,
      tintHue: this.tintHue,
      tintAmount: this.tintAmount,
      chamEnabled: this.chamEnabled,
      chamPrimary: this.chamPrimary,
      chamSecondary: this.chamSecondary,
      chamIntensity: this.chamIntensity,
      textureMergeColor: this.textureMergeColor,
      vertexColors: { ...this.vertexColors },
      faceColors: { ...this.faceColors },
      paintLayer: this.paintLayer?.painted ? serializePaintLayer(this.paintLayer) : null,
      paintWireEdges: this.paintWireEdges?.map(e => ({ ...e })) || null,
      explicitEdges: this.explicitEdges.map(e => ({ ...e })),
      hiddenEdges: this.hiddenEdges.map(e => ({ ...e })),
      visibleEdges: this.visibleEdges.map(e => ({ ...e })),
    };
  }

  static deserialize(data) {
    const m = new EditableMesh(data.name);
    m.id = data.id;
    m.vertices = data.vertices.map(v => ({ ...v }));
    m.faces = data.faces.map(f => [...f]);
    m.position.set(data.position.x, data.position.y, data.position.z);
    m.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    m.scale.set(data.scale.x, data.scale.y, data.scale.z);
    m.visible = data.visible;
    m.locked = data.locked;
    m.color = data.color;
    m.primitiveType = data.primitiveType || null;
    m.segments = data.segments || null;
    m.primitiveParams = data.primitiveParams || null;
    m.smoothShading = data.smoothShading || false;
    m.clearCoatEnabled = data.clearCoatEnabled || false;
    m.clearCoatIntensity = data.clearCoatIntensity ?? 0.5;
    m.material = data.material || null;
    m.referenceUrl = data.referenceUrl || null;
    m.uvMode = data.uvMode || 'box';
    m.reflectionEnabled = data.reflectionEnabled || false;
    m.reflectionIntensity = data.reflectionIntensity ?? 0.6;
    m.reflectionRoughness = data.reflectionRoughness ?? 0.1;
    m.roughness = data.roughness ?? null;
    m.metalness = data.metalness ?? null;
    m.opacity = data.opacity ?? 1;
    m.emissive = data.emissive ?? 0;
    m.tintHue = data.tintHue ?? 0;
    m.tintAmount = data.tintAmount ?? 0;
    m.chamEnabled = data.chamEnabled ?? ((data.chamIntensity ?? 0) > 0);
    m.chamPrimary = data.chamPrimary ?? '#ff0000';
    m.chamSecondary = data.chamSecondary ?? '#00aaff';
    m.chamIntensity = data.chamIntensity ?? 0;
    m.textureMergeColor = data.textureMergeColor || false;
    m.vertexColors = { ...(data.vertexColors || {}) };
    m.faceColors = { ...(data.faceColors || {}) };
    m.paintLayer = data.paintLayer ? deserializePaintLayer(data.paintLayer) : null;
    m.paintWireEdges = data.paintWireEdges?.map(e => ({ ...e })) || null;
    m._paintDense = !!m.paintWireEdges;
    m.explicitEdges = (data.explicitEdges || []).map(e => ({ ...e }));
    for (const e of [...m.explicitEdges]) splitFaceBetween(m, e.v1, e.v2);
    m.hiddenEdges = (data.hiddenEdges || []).map(e => ({ ...e }));
    m.visibleEdges = (data.visibleEdges || []).map(e => ({ ...e }));
    return m;
  }
}