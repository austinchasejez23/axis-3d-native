import * as THREE from 'three';
import { makeFatSegments } from '@/lib/fatLines';
import { theme } from '@/lib/theme';

const up = new THREE.Vector3(0, 1, 0);
const viewPosition = new THREE.Vector3();
const resolution = new THREE.Vector2();
const axes = [
  [new THREE.Vector3(1, 0, 0), 0xef4444],
  [new THREE.Vector3(0, 1, 0), 0x22c55e],
  [new THREE.Vector3(0, 0, 1), 0x3b82f6],
];

function createArrows(renderer) {
  const group = new THREE.Group();
  group.name = 'Object axis arrows';
  for (const [direction, color] of axes) {
    const shaft = makeFatSegments([0, 0, 0, 0, 0.82, 0], color, 2, renderer);
    shaft.material.depthTest = false;
    shaft.quaternion.setFromUnitVectors(up, direction);
    shaft.renderOrder = 1100;
    shaft.raycast = () => {};
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false }));
    head.position.copy(direction).multiplyScalar(0.9);
    head.quaternion.copy(shaft.quaternion);
    head.renderOrder = 1101;
    head.raycast = () => {};
    group.add(shaft, head);
  }
  return group;
}

function disposeGroup(group) {
  group.removeFromParent();
  group.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); });
}

// Display-only overlays: never added to editable meshes or their raycast targets.
export function updateObjectAxisArrows(manager) {
  const enabled = theme.objectArrowsEnabled && manager.selection?.type === 'object';
  const ids = enabled ? manager.targetMeshIds() : [];
  if (!manager.objectAxisArrows && !ids.length) return;
  const groups = manager.objectAxisArrows || (manager.objectAxisArrows = new Map());
  for (const [id, group] of groups) {
    if (!ids.includes(id)) { disposeGroup(group); groups.delete(id); }
  }
  manager.renderer.getSize(resolution);
  for (const id of ids) {
    const mesh = manager.getMesh(id);
    if (!mesh) continue;
    let group = groups.get(id);
    if (!group) { group = createArrows(manager.renderer); groups.set(id, group); manager.scene.add(group); }
    viewPosition.copy(mesh.position).applyMatrix4(manager.camera.matrixWorldInverse);
    group.visible = mesh.visible && -viewPosition.z > manager.camera.near;
    group.position.copy(mesh.position);
    group.quaternion.setFromEuler(mesh.rotation);
    // Constant readable screen size, independent of object scale or camera zoom.
    const length = 64 * 2 * Math.max(manager.camera.near, -viewPosition.z)
      * Math.tan(THREE.MathUtils.degToRad(manager.camera.fov / 2)) / Math.max(1, resolution.y);
    group.scale.set(length * (Math.sign(mesh.scale.x) || 1), length * (Math.sign(mesh.scale.y) || 1), length * (Math.sign(mesh.scale.z) || 1));
    for (const child of group.children) child.material.resolution?.copy(resolution);
  }
}

export function disposeObjectAxisArrows(manager) {
  for (const group of manager.objectAxisArrows?.values() || []) disposeGroup(group);
  manager.objectAxisArrows?.clear();
}