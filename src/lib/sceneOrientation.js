import * as THREE from 'three';

// Orientation reset: line an object's own axes up with the world axes without
// moving or reshaping it. The rotation is folded into the vertices, so a
// following single-axis scale stretches along the world axis instead of the
// object's turned axis (a cube turned 45° then becomes a long diamond).
// Each reset remembers the rotation it removed, so it can be taken back later
// without losing edits made in between.

// Give an object the rotation R·q while it stays exactly where it is on
// screen. The world shape is R·S·v, so every vertex becomes S⁻¹·q⁻¹·S·v.
function reorient(mesh, q) {
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
  mesh.rotation.setFromQuaternion(new THREE.Quaternion().setFromEuler(mesh.rotation).multiply(q));
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

  // Returns false when nothing is selected.
  P.resetOrientation = /** @this {import("./SceneManager").SceneManager} */ function () {
    const meshes = this.orientationTargets();
    if (!meshes.length) return false;
    // An object already lined up with the world has nothing to reset; leaving
    // it alone keeps the rotation an earlier reset can still bring back.
    const turned = meshes.filter((mesh) => isTurned(mesh.rotation));
    if (!turned.length) return true;
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
    return this.orientationTargets().some((mesh) => mesh.orientationResets?.length);
  };

  // Brings back the orientation the last reset removed, carrying along any
  // rotation applied since; the shape and every edit stay as they are.
  P.undoOrientationReset = /** @this {import("./SceneManager").SceneManager} */ function () {
    const meshes = this.orientationTargets().filter((mesh) => mesh.orientationResets?.length);
    if (!meshes.length) return false;
    this.pushUndo();
    for (const mesh of meshes) {
      const stack = [...mesh.orientationResets];
      const [x, y, z, order] = stack.pop();
      if (!reorient(mesh, new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order || 'XYZ')))) continue;
      mesh.orientationResets = stack;
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
