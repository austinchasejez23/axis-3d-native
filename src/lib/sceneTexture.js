import * as THREE from 'three';

// Texture application for selected objects. A local image file is loaded into
// a RepeatWrapping THREE.Texture and assigned to the mesh's material map; the
// mesh's box-projected UVs (see EditableMesh.toBufferGeometry) make a seamless
// image wrap across the whole surface. Textures are session-only (not saved
// with the project) to avoid bloating local storage with base64 image data.

export function applySceneTexture(SceneManagerClass) {
  SceneManagerClass.prototype.applyTextureToSelection = /** @this {import('./SceneManager.js').SceneManager} */ function (file) {
    return this.applyTextureUrl(URL.createObjectURL(file), true);
  };

  // Shared loader used by both the local-file upload and the preset library.
  // objectUrl marks blob URLs so they get revoked when the texture is cleared.
  SceneManagerClass.prototype.applyTextureUrl = /** @this {import('./SceneManager.js').SceneManager} */ function (url, objectUrl = false) {
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
          const t = mesh.textureTransform || { scale: 1, rotation: 0, mirror: false };
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

  // UV tool: switch how UVs are projected onto the selected object(s) and
  // rebuild so the mapped texture re-wraps immediately.
  SceneManagerClass.prototype.setUVMode = /** @this {import('./SceneManager.js').SceneManager} */ function (mode) {
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

  SceneManagerClass.prototype.setTextureScale = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId, scale) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return;
    mesh.textureTransform = { ...(mesh.textureTransform || { rotation: 0 }), scale };
    if (mesh.mapTexture) {
      mesh.mapTexture.repeat.set(scale, scale);
      mesh.mapTexture.needsUpdate = true;
    }
  };

  SceneManagerClass.prototype.setTextureRotation = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId, rad) {
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
  SceneManagerClass.prototype.setTextureMirror = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId, on) {
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

  SceneManagerClass.prototype.clearTexture = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const ids = this.targetMeshIds();
    if (ids.length === 0) return;
    this.pushUndo();
    for (const id of ids) {
      const mesh = this.getMesh(id);
      if (!mesh) continue;
      if (mesh.mapTexture) { mesh.mapTexture.dispose(); mesh.mapTexture = null; }
      if (mesh.textureUrl) { URL.revokeObjectURL(mesh.textureUrl); mesh.textureUrl = null; }
      this.updateObjectMaterial(id);
      this.rebuildThreeMesh(id);
    }
    this.updateHighlights();
  };

  SceneManagerClass.prototype.resetSurfaceAppearance = /** @this {import('./SceneManager.js').SceneManager} */ function () {
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