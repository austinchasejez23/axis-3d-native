import * as THREE from 'three';
import { theme } from './theme';

function makeProxy(mesh) {
  const box = new THREE.Box3();
  for (const v of mesh.vertices) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4));
  geometry.translate(center.x, center.y, center.z);
  return geometry;
}

export function applyFocusRenderBoost(SceneManager) {
  SceneManager.prototype.setFocusRenderBoost = function (enabled) {
    this.focusRenderBoostEnabled = !!enabled;
    this.refreshFocusRenderBoost();
  };

  SceneManager.prototype.refreshFocusRenderBoost = function () {
    const active = new Set(this.selectedMeshIds || []);
    if (this.selection?.meshId) active.add(this.selection.meshId);
    else if (this._focusMeshId) active.add(this._focusMeshId);
    if (this.selection?.meshId) this._focusMeshId = this.selection.meshId;
    for (const [id, obj] of this.threeObjects) {
      const mesh = this.getMesh(id);
      const reduce = this.focusRenderBoostEnabled && !active.has(id) && mesh?.vertices.length;
      if (reduce && !obj.focusProxyGeometry) {
        obj.focusDetailGeometry = obj.mesh.geometry;
        obj.focusProxyGeometry = makeProxy(mesh);
        obj.mesh.geometry = obj.focusProxyGeometry;
        obj.wireframe.visible = false;
        // The performance proxy must not vanish when the actual geometry is
        // configured for wire-only drawing.
        if (mesh.importedWireframeOnly) obj.material.colorWrite = true;
      } else if (!reduce && obj.focusProxyGeometry) {
        obj.mesh.geometry = obj.focusDetailGeometry;
        obj.focusProxyGeometry.dispose();
        obj.focusProxyGeometry = null;
        obj.focusDetailGeometry = null;
        obj.wireframe.visible = theme.wireframeEnabled !== false && !this.wireframesHidden;
        if (mesh.importedWireframeOnly) obj.material.colorWrite = !obj.wireframe.visible;
        if (obj.wireframeStale) this._refreshWireframe(obj, mesh);
      }
    }
  };
}