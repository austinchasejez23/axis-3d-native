import * as THREE from 'three';
import { theme } from '@/lib/theme';

// Snap math shared by move, rotate and scale. The Snap toggle drives all
// three independently of whether the visual grid is shown.
export function snapActive() {
  return theme.snapToGrid;
}

function gridSpacing() {
  return Math.max(0.000001, Number(theme.snapDistance) || 0);
}

// Size of the current selection along the axes its scale is applied on.
//
// An object is scaled along its OWN axes, so its size is measured unrotated
// (local bounds x scale) — a rotated box's world bounding box is bigger than the
// box itself and would report a dimension the user never sees. Sub-object
// selections are scaled along world axes, so those are measured in world space.
export function selectionSize(manager) {
  const localSize = (mesh) => {
    const box = new THREE.Box3();
    for (const v of mesh.vertices) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    size.x *= Math.abs(mesh.scale.x);
    size.y *= Math.abs(mesh.scale.y);
    size.z *= Math.abs(mesh.scale.z);
    return size;
  };

  if (manager.isGroupMode()) {
    // A group scales about its shared center, so its overall extent is what
    // matters — measured in world space across every selected object.
    const box = new THREE.Box3();
    for (const id of manager.selectedMeshIds) {
      const mesh = manager.getMesh(id);
      if (!mesh) continue;
      const wm = manager.getWorldMatrix(mesh);
      for (const v of mesh.vertices) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm));
    }
    return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  }

  const mesh = manager.getMesh(manager.selection.meshId);
  if (!mesh) return null;
  if (manager.selection.type === 'object') return localSize(mesh);

  const box = new THREE.Box3();
  const wm = manager.getWorldMatrix(mesh);
  for (const id of manager.getSelectedVertexIds()) {
    const v = mesh.getVertex(id);
    if (v) box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(wm));
  }
  return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
}

// Corrective factor that lands the size on the nearest configured snap increment.
function factorForSize(size) {
  if (!(size > 1e-6)) return 1;
  if (!(theme.snapDistance > 0)) return 1;
  const spacing = gridSpacing();
  const nearest = Math.round(size / spacing) * spacing;
  if (nearest <= 1e-6) return 1;
  return nearest / size;
}

// Uniform scale is driven by the largest axis so the shape never distorts.
export function uniformScaleSnapFactor(manager) {
  if (!snapActive()) return 1;
  const size = selectionSize(manager);
  if (!size) return 1;
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
  return factorForSize(size[axis]);
}

export function axisScaleSnapFactor(manager, axis) {
  if (!snapActive()) return 1;
  const size = selectionSize(manager);
  if (!size) return 1;
  return factorForSize(size[axis]);
}

// Rotation snaps to fixed angle steps. The leftover fraction of a step is kept
// so a slow drag still accumulates instead of being thrown away each frame.
export function snapAngleDelta(manager, angle) {
  if (!snapActive()) return angle;
  const step = (Math.max(0, theme.snapAngle) * Math.PI) / 180;
  if (!step) return angle;
  const residual = (manager._angleResidual || 0) + angle;
  const steps = Math.trunc(residual / step);
  manager._angleResidual = residual - steps * step;
  return steps * step;
}