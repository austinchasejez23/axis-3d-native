import * as THREE from 'three';
import { capturePaintPatches, applyPaintPatches } from './paintLayer';

// Undo / lock / object-transform helpers attached to SceneManager.prototype.
// Kept in a separate module so the main SceneManager source stays maintainable.

export function applySceneUndo(SceneManager) {
  const P = SceneManager.prototype;

  P.captureSnapshot = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    return {
      meshes: this.meshes.map((m) => m.clone()),
      selection: { ...this.selection, indices: [...this.selection.indices] },
      selectedMeshIds: [...this.selectedMeshIds],
      multiSelect: this.multiSelect,
      selectionMode: this.selectionMode,
      lights: this.serializeSceneLights?.() || [],
      selectedLightId: this.selectedLightId,
    };
  };

  P.pushUndoSnapshot = /** @this {import('./SceneManager.js').SceneManager} */ function (snapshot) {
    // Cheap monotonic marker of "the scene was edited", so autosave can detect
    // changes without serializing the whole model.
    this.editVersion = (this.editVersion || 0) + 1;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
  };

  P.selectionChanged = /** @this {import('./SceneManager.js').SceneManager} */ function (before) {
    const a = before.selection, b = this.selection;
    if (a.meshId !== b.meshId || a.type !== b.type || a.indices.length !== b.indices.length) return true;
    if (a.indices.some((v, i) => v !== b.indices[i])) return true;
    if (before.selectedMeshIds.length !== this.selectedMeshIds.length) return true;
    if (before.selectedMeshIds.some((v, i) => v !== this.selectedMeshIds[i])) return true;
    return false;
  };

  P.pushUndo = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    // Each new gesture starts its rotation snapping from zero.
    this._angleResidual = 0;
    this.pushUndoSnapshot(this.captureSnapshot());
  };

  P.restoreSnapshot = /** @this {import('./SceneManager.js').SceneManager} */ function (snapshot) {
    this.editVersion = (this.editVersion || 0) + 1;
    this.meshes = snapshot.meshes.map((m) => m.clone());
    for (const mesh of this.meshes) {
      if (!this.threeObjects.has(mesh.id)) this.buildThreeMesh(mesh);
      else {
        this.rebuildThreeMesh(mesh.id);
        // A paint layer that appeared or vanished needs the material's shader
        // to follow (only the geometry is refreshed above).
        const obj = this.threeObjects.get(mesh.id);
        if ((obj.material.userData.axisPaintTexture || null) !== (mesh.paintLayer?.texture || null)) this.updateObjectMaterial(mesh.id);
      }
    }
    // Brush / spray pixels this snapshot expects back on its paint layers.
    if (snapshot.paintPatches?.length) applyPaintPatches(this, snapshot.paintPatches);
    const existingIds = new Set(this.meshes.map((m) => m.id));
    for (const id of [...this.threeObjects.keys()]) {
      if (!existingIds.has(id)) this.removeMesh(id);
    }
    this.selection = snapshot.selection;
    this.selectedMeshIds = snapshot.selectedMeshIds ? [...snapshot.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    this.multiSelect = !!snapshot.multiSelect;
    if (snapshot.lights) this.restoreSceneLights?.(snapshot.lights, snapshot.selectedLightId);
    if (snapshot.selectionMode && snapshot.selectionMode !== this.selectionMode) {
      this.selectionMode = snapshot.selectionMode;
      this.cb.onSelectionModeChange?.(this.selectionMode);
    }
    this.updateHighlights();
    this.updateStats();
    this.updateHud();
    this.cb.onMultiSelectChange?.(this.multiSelect);
  };

  P.undo = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.undoStack.length === 0) return false;
    this.endPaintStroke?.();
    const current = this.captureSnapshot();
    const target = this.undoStack.pop();
    // The pixels about to be reverted become the redo step's own patch.
    if (target.paintPatches?.length) current.paintPatches = capturePaintPatches(this, target.paintPatches);
    this.redoStack.push(current);
    this.restoreSnapshot(target);
    return true;
  };

  P.redo = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    if (this.redoStack.length === 0) return false;
    const current = this.captureSnapshot();
    const target = this.redoStack.pop();
    if (target.paintPatches?.length) current.paintPatches = capturePaintPatches(this, target.paintPatches);
    this.undoStack.push(current);
    this.restoreSnapshot(target);
    return true;
  };

  P.lockSelection = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const ids = this.isGroupMode() ? [...this.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    if (ids.length === 0) return false;
    for (const id of ids) { const m = this.getMesh(id); if (m) m.locked = true; }
    this.clearSelection();
    this.cb.onLockChange?.();
    return true;
  };

  P.unlockAll = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    let any = false;
    for (const m of this.meshes) { if (m.locked) { m.locked = false; any = true; } }
    this.cb.onLockChange?.();
    return any;
  };

  P.hasLockedObjects = /** @this {import('./SceneManager.js').SceneManager} */ function () { return this.meshes.some((m) => m.locked); };

  // Object-level transform for the Transform drawer: live preview (no undo per
  // edit); the drawer pushes a single pre-edit snapshot on Apply.
  P.getObjectTransform = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return null;
    const toDeg = (r) => (r * 180) / Math.PI;
    return {
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [toDeg(mesh.rotation.x), toDeg(mesh.rotation.y), toDeg(mesh.rotation.z)],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
    };
  };

  P.getSelectionTransform = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId) {
    const transform = this.getObjectTransform(meshId);
    if (!transform) return null;
    if (this.isGroupMode()) {
      const center = this.getGroupCenter();
      const primaryId = this.selection.meshId && this.selectedMeshIds.includes(this.selection.meshId)
        ? this.selection.meshId
        : this.selectedMeshIds[0];
      const primaryTransform = primaryId ? this.getObjectTransform(primaryId) : transform;
      return center ? {
        position: [center.x, center.y, center.z],
        rotation: primaryTransform?.rotation || transform.rotation,
        scale: [1, 1, 1],
      } : transform;
    }
    if (this.selection.type === 'object') return transform;
    const center = this.getSelectionCenter();
    const rotation = this.subRotation || { x: 0, y: 0, z: 0 };
    const toDeg = (r) => (r * 180) / Math.PI;
    return {
      position: [center.x, center.y, center.z],
      rotation: [toDeg(rotation.x), toDeg(rotation.y), toDeg(rotation.z)],
      scale: [1, 1, 1],
    };
  };

  P.setSelectionPositionLive = /** @this {import('./SceneManager.js').SceneManager} */ function (position) {
    if (this.isGroupMode()) {
      const center = this.getGroupCenter();
      if (!center) return;
      this.translateGroup(new THREE.Vector3(position[0], position[1], position[2]).sub(center));
      return;
    }
    this.setObjectPositionLive(position[0], position[1], position[2]);
  };

  P.setObjectTransformLive = /** @this {import('./SceneManager.js').SceneManager} */ function (meshId, { position, rotation, scale }) {
    const mesh = this.getMesh(meshId);
    if (!mesh || mesh.locked) return;
    if (position) mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0] * Math.PI / 180, rotation[1] * Math.PI / 180, rotation[2] * Math.PI / 180);
    if (scale) mesh.scale.set(Math.max(0.01, scale[0]), Math.max(0.01, scale[1]), Math.max(0.01, scale[2]));
    this.updateObjectTransform(meshId);
    this.updateHighlights();
    this.updateHud();
  };
}