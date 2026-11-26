import * as THREE from 'three';
import { capturePaintPatches, applyPaintPatches } from './paintLayer';

// Undo / lock / object-transform helpers attached to SceneManager.prototype.
// Kept in a separate module so the main SceneManager source stays maintainable.

// Plain data (numbers, strings, arrays, plain objects) compared by value;
// anything else (a paint layer, a texture) only matches itself.
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (!sameValue(a[k], b[k])) return false;
  return true;
}

// Everything the surface and wireframe of an object are built from. When an
// undo step leaves these as they are, rebuilding the object is wasted work.
const SURFACE_KEYS = ['vertices', 'faces', 'faceRenderTriangles', 'color', 'smoothShading', 'uvMode', 'uvUnwrap',
  'vertexColors', 'faceColors', 'paintLayer', 'paintWireEdges', '_paintDense', 'explicitEdges', 'hiddenEdges',
  'visibleEdges', 'importedFeatureEdges', 'importedWireframeOnly', 'importedQuadsMerged'];
const sameSurface = (a, b) => !!a && !!b && SURFACE_KEYS.every((k) => sameValue(a[k], b[k]));

// Plain data compared by value like sameValue, without allocating.
function sameData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameData(a[i], b[i])) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  let count = 0;
  for (const k in a) {
    count++;
    if (!Object.prototype.hasOwnProperty.call(b, k) || !sameData(a[k], b[k])) return false;
  }
  for (const _k in b) count--;
  return count === 0;
}

// The live object is still exactly what `copy` (a clone of it) holds, in
// every field a clone carries. Caches (underscore fields) don't count.
function sameMeshState(live, copy) {
  for (const key in copy) {
    if (key.charCodeAt(0) === 95 && key !== '_paintDense') continue;
    const a = live[key], b = copy[key];
    if (a === b) continue;
    if (a && b && ((a.isVector3 && b.isVector3) || (a.isEuler && b.isEuler))) {
      if (!a.equals(b)) return false;
      continue;
    }
    if (!sameData(a, b)) return false;
  }
  return true;
}

// The selected objects' ids, each once, in a fixed order.
function groupIds(manager) {
  const ids = [...new Set(manager.selectedMeshIds.filter((id) => manager.getMesh(id)))];
  return ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const copyTurnRecords = (records) => new Map([...records].map(([key, r]) => [key, {
  q: r.q.clone(), rotation: [...r.rotation], scale: [...r.scale], leftAt: r.leftAt,
  resets: (r.resets || []).map((saved) => ({ q: [...saved.q], rotation: [...saved.rotation] })),
}]));

export function applySceneUndo(SceneManager) {
  const P = SceneManager.prototype;

  // Undo steps share the copy of an object that hasn't changed since its last
  // copy (copies are never edited), instead of every step copying every
  // object in the scene.
  P._meshCopies = /** @this {import("./SceneManager").SceneManager} */ function () {
    const previous = this._undoMeshCopies || new Map();
    const next = new Map();
    const copies = this.meshes.map((mesh) => {
      const last = previous.get(mesh.id);
      const copy = last && sameMeshState(mesh, last) ? last : mesh.clone();
      next.set(mesh.id, copy);
      return copy;
    });
    this._undoMeshCopies = next;
    return copies;
  };

  // deferMeshes: for selection-only changes. The mesh and light copies are
  // skipped here and made by pushUndoSnapshot, and only if the selection
  // actually changed (selecting never edits a mesh, so the copy is identical).
  P.captureSnapshot = /** @this {import("./SceneManager").SceneManager} */ function (deferMeshes = false) {
    this.syncTurnRecords?.();
    return {
      turnRecords: this.turnRecords ? copyTurnRecords(this.turnRecords) : null,
      meshes: deferMeshes ? null : this._meshCopies(),
      selection: { ...this.selection, indices: [...this.selection.indices] },
      selectedMeshIds: [...this.selectedMeshIds],
      multiSelect: this.multiSelect,
      selectionMode: this.selectionMode,
      lights: deferMeshes ? null : (this.serializeSceneLights?.() || []),
      selectedLightId: this.selectedLightId,
    };
  };

  // Two or more objects, faces, edges or vertices selected together have no
  // rotation of their own. Their rotation numbers start at 0 and count how
  // far they've been turned together (objects also count their scale from
  // 1). The count is kept for that exact selection until something is edited
  // while it isn't selected, or there's an undo, a redo or a mode change;
  // then it starts at 0 again. Selecting other things isn't an edit.
  P.turnKey = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (this.isGroupMode()) return `objects:${groupIds(this).join('|')}`;
    const sel = this.selection;
    if (!sel?.meshId || sel.type === 'object' || !(sel.indices?.length > 1)) return '';
    const key = this._subRotationKey();
    return key ? `${sel.meshId}:${key}` : '';
  };

  P.getTurnRecord = /** @this {import("./SceneManager").SceneManager} */ function (create = false) {
    const key = this.turnKey();
    if (!key) return null;
    let record = this.turnRecords.get(key);
    if (record && record.leftAt !== null) {
      if (record.leftAt === this.editStamp) record.leftAt = null;
      else { this.turnRecords.delete(key); record = undefined; }
    }
    if (!record && create) {
      record = { q: new THREE.Quaternion(), rotation: [0, 0, 0], scale: [1, 1, 1], leftAt: null, resets: [] };
      this.turnRecords.set(key, record);
    }
    return record || null;
  };

  P.getGroupRecord = /** @this {import("./SceneManager").SceneManager} */ function (create = false) {
    return this.isGroupMode() ? this.getTurnRecord(create) : null;
  };

  // Runs whenever the selection may have changed, before anything is edited:
  // a count whose selection was just left remembers the edits made so far.
  P.syncTurnRecords = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (!this.turnRecords?.size) return;
    const current = this.turnKey();
    if (current) this.getTurnRecord();
    for (const [key, record] of this.turnRecords) {
      if (key !== current && record.leftAt === null) record.leftAt = this.editStamp;
    }
  };

  // Every count back to 0, and a reset edge or vertex back to its true angle.
  P.clearTurnRecords = /** @this {import("./SceneManager").SceneManager} */ function () {
    this.turnRecords?.clear();
    this.tempTurn = null;
  };

  P.materializeSnapshot = /** @this {import("./SceneManager").SceneManager} */ function (snapshot) {
    if (snapshot.meshes === null) {
      snapshot.meshes = this._meshCopies();
      snapshot.lights = this.serializeSceneLights?.() || [];
    }
    return snapshot;
  };

  P.pushUndoSnapshot = /** @this {import("./SceneManager").SceneManager} */ function (snapshot) {
    // Only a change of selection is saved without its objects: anything else
    // is an edit.
    if (snapshot.meshes !== null) this.editStamp = (this.editStamp || 0) + 1;
    this.materializeSnapshot(snapshot);
    // Cheap monotonic marker of "the scene was edited", so autosave can detect
    // changes without serializing the whole model.
    this.editVersion = (this.editVersion || 0) + 1;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
  };

  P.selectionChanged = /** @this {import("./SceneManager").SceneManager} */ function (before) {
    const a = before.selection, b = this.selection;
    if (a.meshId !== b.meshId || a.type !== b.type || a.indices.length !== b.indices.length) return true;
    if (a.indices.some((v, i) => v !== b.indices[i])) return true;
    if (before.selectedMeshIds.length !== this.selectedMeshIds.length) return true;
    if (before.selectedMeshIds.some((v, i) => v !== this.selectedMeshIds[i])) return true;
    return false;
  };

  P.pushUndo = /** @this {import("./SceneManager").SceneManager} */ function () {
    // Each new gesture starts its rotation snapping from zero.
    this._angleResidual = 0;
    this.pushUndoSnapshot(this.captureSnapshot());
  };

  P.restoreSnapshot = /** @this {import("./SceneManager").SceneManager} */ function (snapshot) {
    this.editVersion = (this.editVersion || 0) + 1;
    this.editStamp = (this.editStamp || 0) + 1;
    const before = new Map(this.meshes.map((m) => [m.id, m]));
    // An object already exactly as the step has it stays as it is; only the
    // others are copied back.
    const copies = new Map();
    this.meshes = snapshot.meshes.map((copy) => {
      copies.set(copy.id, copy);
      const live = before.get(copy.id);
      return live && sameMeshState(live, copy) ? live : copy.clone();
    });
    this._undoMeshCopies = copies;
    for (const mesh of this.meshes) {
      if (!this.threeObjects.has(mesh.id)) this.buildThreeMesh(mesh);
      else {
        const obj = this.threeObjects.get(mesh.id);
        if (before.get(mesh.id) === mesh || sameSurface(before.get(mesh.id), mesh)) {
          // Same shape: only where it sits and whether it shows can differ.
          obj.mesh.position.copy(mesh.position);
          obj.mesh.rotation.copy(mesh.rotation);
          obj.mesh.scale.copy(mesh.scale);
          obj.mesh.visible = mesh.visible;
        } else this.rebuildThreeMesh(mesh.id);
        // A paint layer that appeared or vanished needs the material's shader
        // to follow (only the geometry is refreshed above).
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
    this.tempTurn = null;
    this.selectedMeshIds = snapshot.selectedMeshIds ? [...snapshot.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    if (snapshot.turnRecords) this.turnRecords = copyTurnRecords(snapshot.turnRecords);
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

  // Put back only one object as a snapshot has it, plus the selection: for
  // panels that change nothing but that object (Segments on an edited object
  // restored and compared the whole scene on every slider step).
  // `refresh: false` leaves highlights and stats to the caller, which updates
  // them straight after.
  P.restoreSnapshotObject = /** @this {import("./SceneManager").SceneManager} */ function (snapshot, meshId, { refresh = true } = {}) {
    const saved = snapshot.meshes?.find((m) => m.id === meshId);
    const index = this.meshes.findIndex((m) => m.id === meshId);
    if (!saved || index < 0 || !this.threeObjects.has(meshId)) { this.restoreSnapshot(snapshot); return; }
    this.editVersion = (this.editVersion || 0) + 1;
    this.editStamp = (this.editStamp || 0) + 1;
    const live = this.meshes[index];
    if (!sameMeshState(live, saved)) {
      const mesh = saved.clone();
      this.meshes[index] = mesh;
      const obj = this.threeObjects.get(meshId);
      if (sameSurface(live, mesh)) {
        obj.mesh.position.copy(mesh.position);
        obj.mesh.rotation.copy(mesh.rotation);
        obj.mesh.scale.copy(mesh.scale);
        obj.mesh.visible = mesh.visible;
      } else this.rebuildThreeMesh(meshId);
      if ((obj.material.userData.axisPaintTexture || null) !== (mesh.paintLayer?.texture || null)) this.updateObjectMaterial(meshId);
      this._undoMeshCopies?.set(meshId, saved);
    }
    this.selection = snapshot.selection;
    this.tempTurn = null;
    this.selectedMeshIds = snapshot.selectedMeshIds ? [...snapshot.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    if (snapshot.turnRecords) this.turnRecords = copyTurnRecords(snapshot.turnRecords);
    this.multiSelect = !!snapshot.multiSelect;
    if (refresh) {
      this.updateHighlights();
      this.updateStats();
    }
    this.updateHud();
    this.cb.onMultiSelectChange?.(this.multiSelect);
  };

  P.undo = /** @this {import("./SceneManager").SceneManager} */ function () {
    this.endPaintStroke?.();
    // Strokes not yet applied come off first, newest first, before history.
    if (this.undoPendingStroke?.()) return true;
    if (this.undoStack.length === 0) return false;
    const current = this.captureSnapshot();
    const target = this.undoStack.pop();
    // The pixels about to be reverted become the redo step's own patch.
    if (target.paintPatches?.length) current.paintPatches = capturePaintPatches(this, target.paintPatches);
    this.redoStack.push(current);
    this.restoreSnapshot(target);
    this.clearTurnRecords();
    this.updateHud();
    return true;
  };

  P.redo = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (this.redoStack.length === 0) return false;
    const current = this.captureSnapshot();
    const target = this.redoStack.pop();
    if (target.paintPatches?.length) current.paintPatches = capturePaintPatches(this, target.paintPatches);
    this.undoStack.push(current);
    this.restoreSnapshot(target);
    this.clearTurnRecords();
    this.updateHud();
    return true;
  };

  P.lockSelection = /** @this {import("./SceneManager").SceneManager} */ function () {
    const ids = this.isGroupMode() ? [...this.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    if (ids.length === 0) return false;
    for (const id of ids) { const m = this.getMesh(id); if (m) m.locked = true; }
    this.clearSelection();
    this.cb.onLockChange?.();
    return true;
  };

  P.unlockAll = /** @this {import("./SceneManager").SceneManager} */ function () {
    let any = false;
    for (const m of this.meshes) { if (m.locked) { m.locked = false; any = true; } }
    this.cb.onLockChange?.();
    return any;
  };

  P.hasLockedObjects = /** @this {import("./SceneManager").SceneManager} */ function () { return this.meshes.some((m) => m.locked); };

  // Object-level transform for the Transform drawer: live preview (no undo per
  // edit); the drawer pushes a single pre-edit snapshot on Apply.
  P.getObjectTransform = /** @this {import("./SceneManager").SceneManager} */ function (meshId) {
    const mesh = this.getMesh(meshId);
    if (!mesh) return null;
    const toDeg = (r) => (r * 180) / Math.PI;
    return {
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [toDeg(mesh.rotation.x), toDeg(mesh.rotation.y), toDeg(mesh.rotation.z)],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
    };
  };

  P.getSelectionTransform = /** @this {import("./SceneManager").SceneManager} */ function (meshId) {
    const transform = this.getObjectTransform(meshId);
    if (!transform) return null;
    if (this.isGroupMode()) {
      const center = this.getDisplayCenter();
      const record = this.getGroupRecord();
      return center ? {
        position: [center.x, center.y, center.z],
        rotation: record ? [...record.rotation] : [0, 0, 0],
        scale: record ? [...record.scale] : [1, 1, 1],
      } : transform;
    }
    if (this.selection.type === 'object') {
      // Position fields describe the visible object's world-space center,
      // not its potentially offset modeling origin.
      // Same center point the HUD shows.
      transform.position = this.getDisplayCenter().toArray();
      return transform;
    }
    const center = this.getDisplayCenter();
    const rotation = this.subRotationDegrees();
    return {
      position: [center.x, center.y, center.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: [1, 1, 1],
    };
  };

  P.setSelectionPositionLive = /** @this {import("./SceneManager").SceneManager} */ function (position) {
    if (this.isGroupMode()) {
      const center = this.getDisplayCenter();
      if (!center) return;
      this.translateGroup(new THREE.Vector3(position[0], position[1], position[2]).sub(center));
      return;
    }
    this.setObjectPositionLive(position[0], position[1], position[2]);
  };

  P.setObjectTransformLive = /** @this {import("./SceneManager").SceneManager} */ function (meshId, { position, rotation, scale }) {
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