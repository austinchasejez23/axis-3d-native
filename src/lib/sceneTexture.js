import * as THREE from 'three';
import { computeUnwrap, unwrapIsValid } from './uvUnwrap';

// Texture application for selected objects. A local image file is loaded into
// a RepeatWrapping THREE.Texture and assigned to the mesh's material map; the
// mesh's box-projected UVs (see EditableMesh.toBufferGeometry) make a seamless
// image wrap across the whole surface. The image is saved with the project
// (a library texture by its address, an uploaded one as a small JPEG copy) and
// put back when the project opens.

export function applySceneTexture(SceneManagerClass) {
  SceneManagerClass.prototype.applyTextureToSelection = function (file) {
    return this.applyTextureUrl(URL.createObjectURL(file), true);
  };

  // Shared loader used by both the local-file upload and the preset library.
  // objectUrl marks blob URLs so they get revoked when the texture is cleared.
  SceneManagerClass.prototype.applyTextureUrl = function (url, objectUrl = false) {
    const sel = this.selection;
    const ids = this.targetMeshIds();
    if (ids.length === 0 || sel.type !== 'object') return false;
    this.pushUndo();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        // Apply the texture transform (set from the Texture drawer) — read fresh
        // so adjustments made while the image was still loading are honored.
        for (const id of ids) {
          const mesh = this.getMesh(id);
          if (!mesh) continue;
          const t = mesh.textureTransform || { scale: 0.25, rotation: 0, mirror: false };
          const copy = tex.clone();
          const wrap = t.mirror ? 1002 : THREE.RepeatWrapping;
          copy.wrapS = wrap;
          copy.wrapT = wrap;
          copy.colorSpace = THREE.SRGBColorSpace;
          copy.anisotropy = 4;
          copy.center.set(0.5, 0.5);
          copy.rotation = t.rotation || 0;
          copy.repeat.set(t.scale || 1, t.scale || 1);
          copy.needsUpdate = true;
          if (mesh.mapTexture) mesh.mapTexture.dispose();
          mesh.mapTexture = copy;
          mesh.textureUrl = objectUrl ? url : null;
          mesh.textureData = null;
          mesh.textureSrc = objectUrl ? null : url;
          this.updateObjectMaterial(id);
          this.rebuildThreeMesh(id);
        }
        this.updateHighlights();
      },
      undefined,
      () => {
        if (objectUrl) URL.revokeObjectURL(url);
      }
    );
    return true;
  };

  // A mesh that came from a saved project has its image stored as data or an
  // address; load it back into a texture with the saved transform.
  SceneManagerClass.prototype.restoreMeshTexture = function (mesh) {
    const source = mesh.textureData || mesh.textureSrc;
    if (mesh.mapTexture || !source) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(source, (tex) => {
      if (mesh.mapTexture || this.getMesh(mesh.id) !== mesh) return;
      const t = mesh.textureTransform || { scale: 0.25, rotation: 0, mirror: false };
      const wrap = t.mirror ? 1002 : THREE.RepeatWrapping;
      tex.wrapS = wrap;
      tex.wrapT = wrap;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.center.set(0.5, 0.5);
      tex.rotation = t.rotation || 0;
      tex.repeat.set(t.scale || 1, t.scale || 1);
      tex.needsUpdate = true;
      mesh.mapTexture = tex;
      this.updateObjectMaterial(mesh.id);
      this.rebuildThreeMesh(mesh.id);
      this.updateHighlights();
    });
  };

  // UV tool: switch how UVs are projected onto the selected object(s) and
  // rebuild so the mapped texture re-wraps immediately.
  SceneManagerClass.prototype.setUVMode = function (mode) {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return false;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      mesh.uvMode = mode;
      this.rebuildThreeMesh(id);
    }
    this.updateHighlights();
    return true;
  };

  // Unwrap: cut the selected object(s) along their seams, flatten and pack
  // them, and map the image 1:1 onto that layout.
  SceneManagerClass.prototype.unwrapSelection = function ({ angle, recordUndo = true } = {}) {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return false;
    if (recordUndo) this.pushUndo();
    for (const id of ids) this.unwrapMesh(id, { angle, recordUndo: false });
    return true;
  };
  // Unwrap one object by id (the UV editor works on its object even while the
  // view is in Edge mode for marking seams, when nothing is selected).
  SceneManagerClass.prototype.unwrapMesh = function (meshId, { angle, recordUndo = true } = {}) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return false;
    if (recordUndo) this.pushUndo();
    mesh.uvUnwrap = computeUnwrap(mesh, angle == null ? undefined : { angle });
    mesh.uvMode = 'unwrap';
    mesh.textureTransform = { ...(mesh.textureTransform || { rotation: 0 }), scale: 1 };
    if (mesh.mapTexture) { mesh.mapTexture.repeat.set(1, 1); mesh.mapTexture.needsUpdate = true; }
    this.rebuildThreeMesh(meshId);
    this._refreshSeamOverlay();
    this.updateHighlights();
    return true;
  };

  // Mark an edge (index in mesh.getEdges()) as a seam, or clear it.
  SceneManagerClass.prototype.toggleMeshSeam = function (meshId, edgeIndex) {
    const mesh = this.getMesh(meshId);
    const edge = mesh?.getEdges()[edgeIndex];
    if (!edge) return false;
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const k = key(edge.v1, edge.v2);
    const seams = mesh.uvSeams || [];
    mesh.uvSeams = seams.some((e) => key(e.v1, e.v2) === k)
      ? seams.filter((e) => key(e.v1, e.v2) !== k)
      : [...seams, { v1: edge.v1, v2: edge.v2 }];
    this.editVersion = (this.editVersion || 0) + 1;
    return true;
  };

  // Everything the UV editor changes, so its X can put it all back.
  SceneManagerClass.prototype.captureUvState = function (meshId) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return null;
    return {
      uvMode: mesh.uvMode,
      uvSeams: (mesh.uvSeams || []).map((e) => ({ ...e })),
      uvUnwrap: mesh.uvUnwrap ? { ...mesh.uvUnwrap, faces: mesh.uvUnwrap.faces.map((c) => c?.map((uv) => [...uv])), islands: mesh.uvUnwrap.islands.map((i) => [...i]) } : null,
      textureTransform: { ...(mesh.textureTransform || {}) },
    };
  };
  SceneManagerClass.prototype.restoreUvState = function (meshId, state) {
    const mesh = this.getMesh(meshId);
    if (!mesh || !state) return false;
    mesh.uvMode = state.uvMode;
    mesh.uvSeams = state.uvSeams.map((e) => ({ ...e }));
    mesh.uvUnwrap = state.uvUnwrap;
    mesh.textureTransform = { ...state.textureTransform };
    if (mesh.mapTexture) {
      const s = mesh.textureTransform.scale || 1;
      mesh.mapTexture.repeat.set(s, s);
      mesh.mapTexture.needsUpdate = true;
    }
    this.rebuildThreeMesh(meshId);
    this._refreshSeamOverlay();
    this.updateHighlights();
    return true;
  };

  // Show where the surface is cut open while the UV panel is open: seams the
  // user marked in red, cuts made by the cut angle in amber. Pass null to hide.
  SceneManagerClass.prototype.setSeamOverlay = function (meshId) {
    this._seamOverlayMeshId = meshId || null;
    this._refreshSeamOverlay();
  };
  SceneManagerClass.prototype._refreshSeamOverlay = function () {
    if (this._seamOverlay) {
      this._seamOverlay.parent?.remove(this._seamOverlay);
      this._seamOverlay.geometry.dispose();
      this._seamOverlay.material.dispose();
      this._seamOverlay = null;
    }
    const id = this._seamOverlayMeshId;
    const mesh = id ? this.getMesh(id) : null;
    const holder = id ? this.threeObjects?.get(id)?.mesh : null;
    if (!mesh || !holder) return;
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const marked = new Set((mesh.uvSeams || []).map((e) => key(e.v1, e.v2)));
    const pairs = [
      ...(mesh.uvSeams || []).map((e) => [e.v1, e.v2, true]),
      ...(mesh.uvUnwrap?.seams || []).filter(([a, b]) => !marked.has(key(a, b))).map(([a, b]) => [a, b, false]),
    ];
    const positions = [];
    const colors = [];
    const red = new THREE.Color(0xff3b30), amber = new THREE.Color(0xffb020);
    for (const [a, b, mine] of pairs) {
      const va = mesh.getVertex(a), vb = mesh.getVertex(b);
      if (!va || !vb) continue;
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      const c = mine ? red : amber;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, toneMapped: false }));
    lines.renderOrder = 999;
    lines.raycast = () => {};
    holder.add(lines);
    this._seamOverlay = lines;
  };

  // The unwrapped layout of one object, or null when it has none (or its
  // shape changed since).
  SceneManagerClass.prototype.getUnwrapData = function (meshId) {
    const mesh = this.getMesh(meshId);
    return mesh && unwrapIsValid(mesh) ? mesh.uvUnwrap : null;
  };

  // UV editor: replace the layout and show it. Undo is recorded once by the
  // editor (beginUnwrapEdit) before the first change.
  SceneManagerClass.prototype.setUnwrapData = function (meshId, data) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return false;
    mesh.uvUnwrap = data;
    mesh.uvMode = 'unwrap';
    this.rebuildThreeMesh(meshId);
    this._refreshSeamOverlay();
    return true;
  };
  SceneManagerClass.prototype.beginUnwrapEdit = function () { this.pushUndo(); };

  SceneManagerClass.prototype.setTextureScale = function (meshId, scale) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return;
    mesh.textureTransform = { ...(mesh.textureTransform || { rotation: 0 }), scale };
    if (mesh.mapTexture) {
      mesh.mapTexture.repeat.set(scale, scale);
      mesh.mapTexture.needsUpdate = true;
    }
  };

  SceneManagerClass.prototype.setTextureRotation = function (meshId, rad) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return;
    mesh.textureTransform = { ...(mesh.textureTransform || { scale: 1 }), rotation: rad };
    if (mesh.mapTexture) {
      mesh.mapTexture.center.set(0.5, 0.5);
      mesh.mapTexture.rotation = rad;
      mesh.mapTexture.needsUpdate = true;
    }
  };

  // Seamless tiling: MirrorWrapping reflects each tile so opposite edges always
  // match — no hard seam for any image (repetition becomes mirrored instead).
  SceneManagerClass.prototype.setTextureMirror = function (meshId, on) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return;
    mesh.textureTransform = { ...(mesh.textureTransform || { scale: 1, rotation: 0 }), mirror: !!on };
    if (mesh.mapTexture) {
      const w = on ? 1002 : THREE.RepeatWrapping;
      mesh.mapTexture.wrapS = w;
      mesh.mapTexture.wrapT = w;
      mesh.mapTexture.needsUpdate = true;
    }
  };

  SceneManagerClass.prototype.clearTexture = function () {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      if (mesh.mapTexture) { mesh.mapTexture.dispose(); mesh.mapTexture = null; }
      if (mesh.textureUrl) { URL.revokeObjectURL(mesh.textureUrl); mesh.textureUrl = null; }
      mesh.textureData = null;
      mesh.textureSrc = null;
      this.updateObjectMaterial(id);
      this.rebuildThreeMesh(id);
    }
    this.updateHighlights();
  };

  SceneManagerClass.prototype.resetSurfaceAppearance = function () {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return false;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      if (mesh.textureUrl) URL.revokeObjectURL(mesh.textureUrl);
      mesh.resetSurfaceAppearance();
      this.rebuildThreeMesh(id);
      this.updateObjectMaterial(id);
    }
    this.updateHighlights();
    return true;
  };
}