import * as THREE from 'three';
import { clonePaintLayer } from './paintLayer';

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const IDENTITY = new THREE.Matrix4();

function worldMatrix(mesh) {
  return new THREE.Matrix4().compose(
    mesh.position,
    new THREE.Quaternion().setFromEuler(mesh.rotation),
    mesh.scale,
  );
}

// Reapply the preview's group edits after Count/Axis/Radius/Follow changes.
// Preserve world-space non-uniform scaling, even for rotated copies: the
// residual shear is baked into the fresh clone's local vertex coordinates.
function applyPreviewAdjustment(mesh, adjustment) {
  if (adjustment.equals(IDENTITY)) return;
  const target = adjustment.clone().multiply(worldMatrix(mesh));
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  target.decompose(position, rotation, scale);
  const decomposed = new THREE.Matrix4().compose(position, rotation, scale);
  const correction = decomposed.invert().multiply(target);
  for (const vertex of mesh.vertices) {
    const p = new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(correction);
    vertex.x = p.x;
    vertex.y = p.y;
    vertex.z = p.z;
  }
  mesh.position.copy(position);
  mesh.rotation.setFromQuaternion(rotation);
  mesh.scale.copy(scale);
  mesh.invalidateCache();
}

function around(center, transform) {
  return new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
    .multiply(transform)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
}

export function applySceneRadialArray(SceneManager) {
  const P = SceneManager.prototype;

  P.beginRadialArray = /** @this {import('./SceneManager.js').SceneManager} */ function (options) {
    const mesh = this.getMesh(this.selection.meshId);
    if (!mesh || this.selection.type !== 'object' || this.isGroupMode() || mesh.locked) return false;
    this.cancelRadialArray();
    this._radialArray = {
      sourceId: mesh.id,
      sourceBase: mesh.clone(),
      before: this.captureSnapshot(),
      previewIds: [],
      adjustment: new THREE.Matrix4(),
    };
    this.updateRadialArray({ radius: 3, ...options });
    return this._radialArray?.options || false;
  };

  P.radialArraySelectPreview = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const state = this._radialArray;
    if (!state) return;
    const ids = [state.sourceId, ...state.previewIds].filter((id) => this.getMesh(id));
    this.selection = { meshId: state.sourceId, type: 'object', indices: [] };
    this.selectedMeshIds = ids;
    this.updateHighlights();
    this.updateStats();
    this.updateHud();
  };

  // Called by move/scale/rotate group gestures. Keep a single affine
  // adjustment for this uncommitted preview, not independently edited copies.
  P.recordRadialArrayPreviewAffine = /** @this {import('./SceneManager.js').SceneManager} */ function (change) {
    const state = this._radialArray;
    if (!state || !this.isGroupMode()) return;
    state.adjustment.premultiply(change);
  };

  P.recordRadialArrayPreviewScale = /** @this {import('./SceneManager.js').SceneManager} */ function (factors, center) {
    if (!this._radialArray || !this.isGroupMode()) return;
    const s = new THREE.Matrix4().makeScale(factors.x, factors.y, factors.z);
    this.recordRadialArrayPreviewAffine(around(center, s));
  };

  P.updateRadialArray = /** @this {import('./SceneManager.js').SceneManager} */ function ({ count = 12, axis = 'y', follow = true, radius = 3 } = {}) {
    const state = this._radialArray;
    const source = state ? this.getMesh(state.sourceId) : null;
    if (!state || !source) return false;

    // Rebuild from the unmodified starting shape. The edits recorded during
    // the preview are applied afterwards, never committed while the panel is open.
    for (const id of state.previewIds) this.removeMesh(id);
    state.previewIds = [];

    const base = state.sourceBase;
    const total = Math.max(2, Math.min(64, Math.round(count)));
    const axisVector = AXES[axis] || AXES.y;
    const safeRadius = Math.max(0, Number.isFinite(Number(radius)) ? Number(radius) : 0);
    const radialDirection = axis === 'x'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const sourcePosition = base.position.clone();
    const sourceQuaternion = new THREE.Quaternion().setFromEuler(base.rotation);
    const pivot = sourcePosition.clone().addScaledVector(radialDirection, -safeRadius);

    // Index zero is ALWAYS the original mesh, at its original position. The
    // array's pivot is relative to it, not the world origin or grid center.
    source.vertices = base.vertices.map((vertex) => ({ ...vertex }));
    source.position.copy(base.position);
    source.rotation.copy(base.rotation);
    source.scale.copy(base.scale);
    source.invalidateCache();
    applyPreviewAdjustment(source, state.adjustment);
    this.rebuildThreeMesh(source.id);

    const idBase = Date.now() * 100;
    for (let i = 1; i < total; i++) {
      const angle = (Math.PI * 2 * i) / total;
      const orbit = new THREE.Quaternion().setFromAxisAngle(axisVector, angle);
      const clone = base.clone();
      clone.id = idBase + i;
      clone.paintLayer = clonePaintLayer(base.paintLayer);
      clone.name = `${base.name} radial ${i + 1}`;
      clone.position.copy(sourcePosition).sub(pivot).applyQuaternion(orbit).add(pivot);
      if (follow) clone.rotation.setFromQuaternion(sourceQuaternion.clone().premultiply(orbit));
      applyPreviewAdjustment(clone, state.adjustment);
      this.meshes.push(clone);
      this.buildThreeMesh(clone);
      state.previewIds.push(clone.id);
    }

    state.options = { count: total, axis, follow, radius: safeRadius };
    this.radialArraySelectPreview();
    return true;
  };

  P.commitRadialArray = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const state = this._radialArray;
    if (!state) return false;
    const ids = [state.sourceId, ...state.previewIds].filter((id) => this.getMesh(id));
    this._radialArray = null;
    this.pushUndoSnapshot(state.before);
    this.selectedMeshIds = ids;
    this.selection = { meshId: ids[0] || null, type: 'object', indices: [] };
    this.updateHighlights();
    this.updateStats();
    this.updateHud();
    return true;
  };

  P.cancelRadialArray = /** @this {import('./SceneManager.js').SceneManager} */ function () {
    const state = this._radialArray;
    if (!state) return false;
    this._radialArray = null;
    this.restoreSnapshot(state.before);
    return true;
  };

  // While the tool is open, gesture editing never creates an intermediate
  // undo step with partial/temporary copies. Apply creates ONE undo step.
  const pushUndo = P.pushUndo;
  P.pushUndo = /** @this {import('./SceneManager.js').SceneManager} */ function (...args) {
    if (this._radialArray) return;
    return pushUndo.apply(this, args);
  };

  const translateGroup = P.translateGroup;
  P.translateGroup = /** @this {import('./SceneManager.js').SceneManager} */ function (delta) {
    const tracked = !!this._radialArray && this.isGroupMode();
    const before = tracked ? this.getMesh(this._radialArray.sourceId)?.position.clone() : null;
    const result = translateGroup.call(this, delta);
    if (before) {
      const after = this.getMesh(this._radialArray.sourceId)?.position;
      if (after) {
        const d = after.clone().sub(before);
        this.recordRadialArrayPreviewAffine(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));
      }
    }
    return result;
  };

  const scaleGroup = P.scaleGroup;
  P.scaleGroup = /** @this {import('./SceneManager.js').SceneManager} */ function (factor) {
    const center = this._radialArray && this.isGroupMode() ? this.getGroupCenter()?.clone() : null;
    const result = scaleGroup.call(this, factor);
    if (center) this.recordRadialArrayPreviewScale(new THREE.Vector3(factor, factor, factor), center);
    return result;
  };

  const scaleGroupAxis = P.scaleGroupAxis;
  P.scaleGroupAxis = /** @this {import('./SceneManager.js').SceneManager} */ function (axis, factor) {
    if (!this._radialArray || !this.isGroupMode()) return scaleGroupAxis.call(this, axis, factor);
    const center = this.getGroupCenter()?.clone();
    if (!center) return;
    const factors = new THREE.Vector3(1, 1, 1);
    factors[axis] = factor;
    const affine = around(center, new THREE.Matrix4().makeScale(factors.x, factors.y, factors.z));
    // Every preview instance is scaled in WORLD space, regardless of its
    // rotation. Baking the residual into geometry avoids local-axis skew.
    for (const id of this.selectedMeshIds) {
      const mesh = this.getMesh(id);
      if (!mesh || mesh.locked) continue;
      applyPreviewAdjustment(mesh, affine);
      this.rebuildThreeMesh(id);
    }
    this.recordRadialArrayPreviewAffine(affine);
    this.updateHighlights();
    this.updateHud();
  };

  const scaleSelectionAxis = P.scaleSelectionAxis;
  P.scaleSelectionAxis = /** @this {import('./SceneManager.js').SceneManager} */ function (axis, factor) {
    if (this._radialArray && this.isGroupMode()) return this.scaleGroupAxis(axis, factor);
    return scaleSelectionAxis.call(this, axis, factor);
  };

  const rotateGroupAroundAxis = P.rotateGroupAroundAxis;
  P.rotateGroupAroundAxis = /** @this {import('./SceneManager.js').SceneManager} */ function (angle, axisVec) {
    const center = this._radialArray && this.isGroupMode() ? this.getGroupCenter()?.clone() : null;
    const result = rotateGroupAroundAxis.call(this, angle, axisVec);
    if (center) {
      const q = new THREE.Quaternion().setFromAxisAngle(axisVec.clone().normalize(), angle);
      this.recordRadialArrayPreviewAffine(around(center, new THREE.Matrix4().makeRotationFromQuaternion(q)));
    }
    return result;
  };
}
