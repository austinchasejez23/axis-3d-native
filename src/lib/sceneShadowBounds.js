import * as THREE from 'three';
import { theme } from './theme';

// Direction default lighting's key light shines in: from above and to the
// left, so shadows fall out to the side where they can be seen.
const DEFAULT_KEY_DIRECTION = new THREE.Vector3(5, -8, -1.5).normalize();

// Fit shadow precision to real geometry, not a fixed box around the light icon.
export default function updateSceneShadowBounds(manager) {
  const defaultMode = !!theme.defaultLightingEnabled;
  let lights = defaultMode ? [] : (manager.sceneLights || []).filter((light) => light.shadows);
  // Default lighting's key light, fitted the same way as a custom directional.
  if (defaultMode && theme.shadowsEnabled && manager.dirLight) {
    lights = [{ id: 'default-key', type: 'directional', range: 20, object: manager.dirLight, target: manager.dirLight.target, direction: DEFAULT_KEY_DIRECTION }];
  }
  if (!lights.length) {
    manager._shadowBoundsSignature = null;
    return;
  }

  // Fitting shadow cameras requires walking every visible mesh and transforming
  // its bounding box. Skip that work on idle frames when neither geometry,
  // transforms, visibility nor shadow-light settings changed.
  if (!manager._liveEdit) {
    const meshSignature = [...manager.threeObjects.entries()].map(([id, entry]) => {
      const mesh = entry.mesh;
      const p = mesh.position, r = mesh.rotation, s = mesh.scale;
      return `${id}:${mesh.visible ? 1 : 0}:${mesh.geometry.uuid}:${p.x},${p.y},${p.z}:${r.x},${r.y},${r.z}:${s.x},${s.y},${s.z}`;
    }).join('|');
    const lightSignature = lights.map((record) =>
      `${record.id}:${record.type}:${record.range}:${record.direction ? 'key' : record.rotation.join(',')}:${record.object.shadow.mapSize.x}x${record.object.shadow.mapSize.y}`
    ).join('|');
    const signature = `${meshSignature}#${lightSignature}`;
    if (signature === manager._shadowBoundsSignature) return;
    manager._shadowBoundsSignature = signature;
  } else {
    // Live vertex deformation reuses the same BufferGeometry, so its UUID
    // cannot represent the changing bounds. Refit every live-edit frame and
    // force one final cached calculation after the edit ends.
    manager._shadowBoundsSignature = null;
  }

  const bounds = new THREE.Box3();
  let smallest = Infinity;
  for (const { mesh } of manager.threeObjects.values()) {
    if (!mesh.visible) continue;
    mesh.updateMatrixWorld(true);
    // Live vertex edits can invalidate the cached geometry bounds.
    if (!mesh.geometry.boundingBox || manager._liveEdit) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (box.isEmpty()) continue;
    bounds.union(box);
    const size = box.getSize(new THREE.Vector3());
    for (const value of [size.x, size.y, size.z]) if (value > 1e-8) smallest = Math.min(smallest, value);
  }
  if (bounds.isEmpty()) return;
  const span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 0.001);
  for (const record of lights) {
    const { object } = record;
    object.shadow.normalBias = Math.min(smallest * 0.02, record.range / object.shadow.mapSize.x * 0.8);
    object.shadow.bias = -0.0002;
    if (record.type === 'directional') {
      const direction = record.direction ? record.direction.clone() : new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(...record.rotation));
      const coverage = bounds.clone();
      // Include the actual ground projection of the geometry, not the whole ground plane.
      if (direction.y < -0.01) for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const distance = Math.min(Math.max(0, -y / direction.y), span * 8);
        coverage.expandByPoint(new THREE.Vector3(x, y, z).addScaledVector(direction, distance));
      }
      const center = coverage.getCenter(new THREE.Vector3());
      const radius = Math.max(coverage.getSize(new THREE.Vector3()).length() * 0.525, 0.001);
      object.shadow.normalBias = Math.min(smallest * 0.02, radius * 2 / object.shadow.mapSize.x * 0.8);
      // Moving a directional source along its rays does not change its illumination.
      object.position.copy(center).addScaledVector(direction, -radius * 2);
      record.target.position.copy(center);
      record.target.updateMatrixWorld();
      Object.assign(object.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: radius * 0.01, far: radius * 4 });
    } else {
      object.shadow.camera.near = Math.max(0.00001, Math.min(smallest * 0.01, record.range * 0.001));
      object.shadow.camera.far = record.range;
    }
    object.shadow.camera.updateProjectionMatrix();
  }
  // The ground that catches shadows covers the scene and where its shadows
  // fall, wherever the objects are (it was a fixed 40×40 square at the origin).
  if (manager.shadowGround) {
    const reach = Math.max(span * 4, 20);
    const center = bounds.getCenter(new THREE.Vector3());
    manager.shadowGround.position.set(center.x, 0, center.z);
    manager.shadowGround.scale.setScalar(Math.max(1, (reach * 2) / 40));
  }
}