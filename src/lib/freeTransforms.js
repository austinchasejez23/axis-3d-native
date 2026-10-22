import * as THREE from 'three';
import { theme } from '@/lib/theme';
import { selectionSize } from '@/lib/snapping';

// Save one fixed frame and extent so scaling never accelerates as the mesh grows.
export function beginFreeScale(manager, gesture) {
  const mesh = manager.getMesh(manager.selection.meshId);
  gesture.freeScaleCenter = manager.getSelectionCenter().clone();
  gesture.freeScaleSize = selectionSize(manager) || new THREE.Vector3(1, 1, 1);
  gesture.freeScaleInverse = manager.selection.type === 'object' && !manager.isGroupMode() && mesh
    ? new THREE.Quaternion().setFromEuler(mesh.rotation).invert() : null;
  gesture.freeScaleLast = new THREE.Vector3(1, 1, 1);
  manager.activeAxis = null;
}

export function updateFreeScale(manager, gesture, x, y) {
  const delta = manager.screenToWorldDrag(gesture.startMidX, gesture.startMidY, x, y, gesture.freeScaleCenter).multiplyScalar(manager.precisionFactor ?? 1);
  if (gesture.freeScaleInverse) delta.applyQuaternion(gesture.freeScaleInverse);
  const factors = new THREE.Vector3(1, 1, 1);
  for (const axis of ['x', 'y', 'z']) {
    const offset = Math.max(0.2, gesture.freeScaleSize[axis] / 4);
    const amount = delta[axis] * (theme.gestureScaleSensitivity ?? 1);
    const target = amount >= 0 ? 1 + amount / offset : offset / (offset - amount);
    factors[axis] = target / gesture.freeScaleLast[axis];
    gesture.freeScaleLast[axis] = target;
  }
  if (!manager.isGroupMode()) {
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(factors[axis] - 1) > 1e-8) manager.scaleSelectionAxis(axis, factors[axis]);
    }
    return;
  }
  // Group scaling is world-space, including spacing between objects; bake any
  // resulting shear into geometry rather than silently scaling only one object.
  const center = gesture.freeScaleCenter;
  for (const id of manager.selectedMeshIds) {
    const mesh = manager.getMesh(id);
    if (!mesh || mesh.locked) continue;
    const world = manager.getWorldMatrix(mesh);
    mesh.position.sub(center).multiply(factors).add(center);
    const inverse = manager.getWorldMatrix(mesh).invert();
    for (const vertex of mesh.vertices) {
      const point = new THREE.Vector3(vertex.x, vertex.y, vertex.z).applyMatrix4(world);
      point.sub(center).multiply(factors).add(center).applyMatrix4(inverse);
      vertex.x = point.x; vertex.y = point.y; vertex.z = point.z;
    }
    mesh.invalidateCache();
    manager.rebuildThreeMesh(id);
  }
  // Free Transform bakes world-space nonuniform scale into the meshes.
  // Record the same affine operation for regenerating the radial preview.
  manager.recordRadialArrayPreviewScale?.(factors, center);
  manager.updateHighlights();
  manager.updateHud();
}

// Once a twist commits rotation, sliding the pair tumbles it in any direction;
// twisting continues to roll it about the view, without choosing a world axis.
export function updateFreeRotation(manager, gesture, x, y, angleDelta) {
  const dx = x - (gesture.rotateLastX ?? gesture.startMidX);
  const dy = y - (gesture.rotateLastY ?? gesture.startMidY);
  const gain = Math.PI / Math.max(160, manager.renderer.domElement.clientHeight);
  const right = new THREE.Vector3().setFromMatrixColumn(manager.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(manager.camera.matrixWorld, 1);
  const axis = manager.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(angleDelta);
  axis.addScaledVector(right, dy * gain).addScaledVector(up, dx * gain);
  const angle = axis.length() * (theme.gestureRotateSensitivity ?? 1) * (manager.precisionFactor ?? 1);
  if (angle > 1e-8) manager.rotateSelectionAroundAxis(angle, axis.normalize());
  gesture.rotateLastX = x; gesture.rotateLastY = y;
  manager.activeAxis = null;
}