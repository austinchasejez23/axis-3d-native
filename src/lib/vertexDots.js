// Selected vertices drawn as small dots. All the dots of a selection are ONE
// instanced mesh (one draw, one material) instead of a separate sphere,
// geometry and material per vertex.
import * as THREE from 'three';

// `centers` holds each dot's world position (x, y, z per dot).
export function makeVertexDots(centers, color) {
  const count = centers.length / 3;
  const geometry = new THREE.SphereGeometry(1, 10, 10);
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false });
  const dots = new THREE.InstancedMesh(geometry, material, count);
  dots.renderOrder = 999;
  // Each dot is sized every frame, so the bounds of the whole set change all
  // the time; a dot outside the view simply isn't drawn by the GPU.
  dots.frustumCulled = false;
  dots.userData.axisDotCenters = centers;
  dots.userData.axisDotsMoved = true;
  return dots;
}

// Unit spheres scaled by their distance to the camera, so a selected vertex
// is always the SAME small dot on screen — a fixed world radius looked tiny
// when zoomed out and huge when zoomed in. Runs right before each render.
export function sizeVertexDots(group, camera) {
  const ortho = !!camera.isOrthographicCamera;
  const orthoDistance = ortho ? (camera.userData.viewDistance ?? 1) : 0;
  const cp = camera.position;
  for (const dots of group.children) {
    const centers = dots.userData?.axisDotCenters;
    if (!centers || !dots.isInstancedMesh) continue;
    const last = dots.userData.axisDotsCamera;
    if (!dots.userData.axisDotsMoved && last && last.ortho === ortho && last.d === orthoDistance &&
        last.x === cp.x && last.y === cp.y && last.z === cp.z) continue;
    const m = dots.instanceMatrix.array;
    for (let i = 0, n = centers.length / 3; i < n; i++) {
      const x = centers[i * 3], y = centers[i * 3 + 1], z = centers[i * 3 + 2];
      let d = orthoDistance;
      if (!ortho) {
        const dx = cp.x - x, dy = cp.y - y, dz = cp.z - z;
        d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const s = Math.max(1e-4, d * 0.0055);
      const o = i * 16;
      m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    }
    dots.instanceMatrix.needsUpdate = true;
    dots.userData.axisDotsMoved = false;
    dots.userData.axisDotsCamera = { ortho, d: orthoDistance, x: cp.x, y: cp.y, z: cp.z };
  }
}
