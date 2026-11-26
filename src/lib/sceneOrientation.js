import * as THREE from 'three';
import { countedAngles } from './rotationNumbers';

// Orientation reset: line an object's own axes up with the world axes without
// moving or reshaping it. The rotation is folded into the vertices, so a
// following single-axis scale stretches along the world axis instead of the
// object's turned axis (a cube turned 45° then becomes a long diamond).
// Each reset remembers the rotation it removed, so it can be taken back later
// without losing edits made in between.

// Give an object the rotation R·q while it stays exactly where it is on
// screen. The world shape is R·S·v, so every vertex becomes S⁻¹·q⁻¹·S·v.
// `near`: the rotation numbers to stay closest to (see rotationNumbers.js).
function reorient(mesh, q, near = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]) {
  const s = mesh.scale;
  if (!s.x || !s.y || !s.z) return false;
  const inverse = q.clone().invert();
  const p = new THREE.Vector3();
  for (const v of mesh.vertices) {
    p.set(v.x * s.x, v.y * s.y, v.z * s.z).applyQuaternion(inverse);
    v.x = p.x / s.x;
    v.y = p.y / s.y;
    v.z = p.z / s.z;
  }
  const order = mesh.rotation.order;
  mesh.rotation.set(...countedAngles(new THREE.Quaternion().setFromEuler(mesh.rotation).multiply(q), near, order), order);
  // A rebuilt primitive would come back in its old orientation.
  mesh.primitiveType = null;
  mesh.invalidateCache();
  return true;
}

const isTurned = (rotation) => Math.abs(rotation.x) > 1e-9 || Math.abs(rotation.y) > 1e-9 || Math.abs(rotation.z) > 1e-9;

export function applySceneOrientation(SceneManager) {
  const P = SceneManager.prototype;

  // The objects a reset applies to: the selected objects, or the object that
  // holds the selected faces, edges or vertices.
  P.orientationTargets = /** @this {import("./SceneManager").SceneManager} */ function () {
    const ids = this.isGroupMode() ? [...this.selectedMeshIds] : (this.selection.meshId ? [this.selection.meshId] : []);
    return ids.map((id) => this.getMesh(id)).filter((mesh) => mesh && !mesh.locked);
  };

  P._finishOrientation = /** @this {import("./SceneManager").SceneManager} */ function (meshes) {
    for (const mesh of meshes) this.rebuildThreeMesh(mesh.id);
    this.editVersion = (this.editVersion || 0) + 1;
    this.updateHighlights();
    this.updateStats();
    this.updateHud();
  };

  // Returns false when nothing is selected. With faces, edges or vertices
  // selected, only their rotation numbers go to 0 and the object isn't
  // touched (resetSubRotation). With two or more objects, the numbers for all
  // of them together go to 0 too.
  P.resetOrientation = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (this.selection.meshId && this.selection.type !== 'object') return this.resetSubRotation();
    const meshes = this.orientationTargets();
    if (!meshes.length) return false;
    const record = this.getGroupRecord();
    if (record && record.rotation.some((d) => d !== 0)) {
      record.resets = [...(record.resets || []), { q: record.q.toArray(), rotation: [...record.rotation] }];
      record.q.identity();
      record.rotation = [0, 0, 0];
    }
    // An object already lined up with the world has nothing to reset; leaving
    // it alone keeps the rotation an earlier reset can still bring back.
    const turned = meshes.filter((mesh) => isTurned(mesh.rotation));
    if (!turned.length) { this.updateHud(); return true; }
    this.pushUndo();
    for (const mesh of turned) {
      const { x, y, z, order } = mesh.rotation;
      const current = new THREE.Quaternion().setFromEuler(mesh.rotation);
      if (!reorient(mesh, current.invert())) continue;
      mesh.rotation.set(0, 0, 0);
      mesh.orientationResets = [...(mesh.orientationResets || []), [x, y, z, order]];
    }
    this._finishOrientation(turned);
    return true;
  };

  P.canUndoOrientationReset = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (this.selection.type !== 'object') return false;
    return this.orientationTargets().some((mesh) => mesh.orientationResets?.length);
  };

  // Brings back the orientation the last reset removed, carrying along any
  // rotation applied since; the shape and every edit stay as they are.
  P.undoOrientationReset = /** @this {import("./SceneManager").SceneManager} */ function () {
    if (this.selection.type !== 'object') return false;
    const meshes = this.orientationTargets().filter((mesh) => mesh.orientationResets?.length);
    if (!meshes.length) return false;
    this.pushUndo();
    for (const mesh of meshes) {
      const stack = [...mesh.orientationResets];
      const [x, y, z, order] = stack.pop();
      const wasZero = !isTurned(mesh.rotation);
      const near = [mesh.rotation.x + x, mesh.rotation.y + y, mesh.rotation.z + z];
      if (!reorient(mesh, new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order || 'XYZ')), near)) continue;
      // Not turned since the reset: exactly the numbers it had before.
      if (wasZero) mesh.rotation.set(x, y, z);
      mesh.orientationResets = stack;
    }
    // Two or more objects: the numbers for all of them together come back too.
    const record = this.getGroupRecord();
    const saved = record?.resets?.pop();
    if (saved) {
      record.q.fromArray(saved.q);
      record.rotation = [...saved.rotation];
    }
    this._finishOrientation(meshes);
    return true;
  };

  // What an orientation change touches, so a panel can put it back on Cancel.
  P.captureOrientation = /** @this {import("./SceneManager").SceneManager} */ function (meshes) {
    return meshes.map((mesh) => ({
      id: mesh.id,
      vertices: mesh.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y, z: v.z })),
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z, mesh.rotation.order],
      resets: (mesh.orientationResets || []).map((r) => [...r]),
      primitiveType: mesh.primitiveType,
    }));
  };

  P.restoreOrientation = /** @this {import("./SceneManager").SceneManager} */ function (saved) {
    const meshes = [];
    for (const item of saved || []) {
      const mesh = this.getMesh(item.id);
      if (!mesh) continue;
      if (!meshes.length) this.pushUndo();
      const byId = new Map(item.vertices.map((v) => [v.id, v]));
      for (const v of mesh.vertices) {
        const was = byId.get(v.id);
        if (was) { v.x = was.x; v.y = was.y; v.z = was.z; }
      }
      const [x, y, z, order] = item.rotation;
      mesh.rotation.set(x, y, z, order);
      mesh.orientationResets = item.resets.map((r) => [...r]);
      mesh.primitiveType = item.primitiveType;
      mesh.invalidateCache();
      meshes.push(mesh);
    }
    if (meshes.length) this._finishOrientation(meshes);
    return meshes.length > 0;
  };
}
