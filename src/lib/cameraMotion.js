import * as THREE from 'three';
import { pulseNavigationResolution } from '@/lib/renderBoost';

// Touch tracks immediately; only a released one-finger orbit has inertia.
// Desktop keeps a separate damped displacement, never a second touch update.
const empty = () => ({ orbitX: 0, orbitY: 0, panX: 0, panY: 0, zoom: 0 });
const MIN_DISTANCE = 0.05, MAX_DISTANCE = 800;
const TOUCH_ORBIT_RESISTANCE = 0.48;
const TOUCH_PAN_RESISTANCE = 0.8;
const TOUCH_ZOOM_RESISTANCE = 0.85;

function applyMotion(manager, motion) {
  const height = Math.max(1, manager.renderer.domElement.getBoundingClientRect().height);
  const angle = 2 * Math.PI / height;
  const scale = 2 * manager.cameraDist * Math.tan(THREE.MathUtils.degToRad(manager.camera.fov / 2)) / height;
  // Pan uses the pre-pinch distance and camera basis, just like navigateTouch.
  if (motion.panX || motion.panY) {
    const right = new THREE.Vector3().setFromMatrixColumn(manager.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(manager.camera.matrixWorld, 1);
    manager.cameraTarget.addScaledVector(right, -motion.panX * scale).addScaledVector(up, motion.panY * scale);
  }
  manager.cameraTheta -= motion.orbitX * angle;
  manager.cameraPhi += motion.orbitY * angle;
  if (motion.zoom) manager.cameraDist = THREE.MathUtils.clamp(manager.cameraDist * Math.exp(motion.zoom), MIN_DISTANCE, MAX_DISTANCE);
  pulseNavigationResolution(manager);
  manager.applyCamera();
}

export function stopCameraMotion(manager) {
  manager._cameraMotion = empty();
  manager._cameraOrbitVelocity = null;
  manager._cameraLastMoveAt = null;
  manager._cameraGlide = null;
  manager._cameraMotionTime = performance.now();
}

export function queueCameraMotion(manager, kind, x, y = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (kind === 'zoom' && x <= 0)) return;
  const touch = manager.pointers?.size > 0;
  if (touch && manager._cameraTouchFrozen) return;
  const delta = empty();
  if (kind === 'zoom') delta.zoom = Math.log(x) * (touch ? TOUCH_ZOOM_RESISTANCE : 1);
  else {
    const resistance = touch ? kind === 'orbit' && manager.pointers.size === 1
      ? TOUCH_ORBIT_RESISTANCE : kind === 'pan' ? TOUCH_PAN_RESISTANCE : 1 : 1;
    delta[`${kind}X`] = x * resistance;
    delta[`${kind}Y`] = y * resistance;
  }
  if (!Object.values(delta).some(Boolean)) return;
  manager._cameraGlide = null;
  if (touch) {
    manager.cameraGesture = true;
    if (kind === 'orbit' && manager.pointers.size === 1 && !manager._cameraTouchMulti) {
      const now = performance.now();
      const gap = now - (manager._cameraLastMoveAt ?? now - 16);
      const elapsed = Math.max(gap, 8);
      const sample = new THREE.Vector2(delta.orbitX, delta.orbitY).multiplyScalar(1000 / elapsed);
      // Filter the release speed, not the finger position: the camera follows
      // while held, but one noisy final move cannot launch a sudden spin.
      if (!manager._cameraOrbitVelocity || gap > 80) manager._cameraOrbitVelocity = sample;
      else manager._cameraOrbitVelocity.lerp(sample, 1 - Math.exp(-elapsed / 55));
      manager._cameraLastMoveAt = now;
    } else manager._cameraOrbitVelocity = null;
    applyMotion(manager, delta);
  } else {
    const pending = manager._cameraMotion || (manager._cameraMotion = empty());
    for (const key of Object.keys(delta)) pending[key] += delta[key];
  }
}

export function releaseCameraMotion(manager, now = performance.now()) {
  const velocity = manager._cameraOrbitVelocity;
  if (manager._cameraTouchMulti || manager._cameraTouchFrozen || !velocity || velocity.length() < 55 || now - manager._cameraLastMoveAt > 80) return;
  manager._cameraGlide = { velocity: velocity.clone().clampLength(0, 850) };
  manager._cameraOrbitVelocity = null;
  manager._cameraMotionTime = now;
}

export function updateCameraMotion(manager, now = performance.now()) {
  const dt = Math.min(0.033, Math.max(0, (now - (manager._cameraMotionTime ?? now)) / 1000));
  manager._cameraMotionTime = now;
  // Active touches own the camera, including when sculpting or manipulating.
  if (manager.pointers?.size > 0) return;
  const step = empty(), glide = manager._cameraGlide;
  if (glide) {
    step.orbitX = glide.velocity.x * dt;
    step.orbitY = glide.velocity.y * dt;
    glide.velocity.multiplyScalar(Math.exp(-9 * dt));
    if (glide.velocity.length() <= 8) manager._cameraGlide = null;
  } else {
    const pending = manager._cameraMotion || (manager._cameraMotion = empty());
    const alpha = 1 - Math.pow(0.95, dt * 60);
    for (const key of Object.keys(step)) {
      step[key] = Math.abs(pending[key]) < 1e-7 ? pending[key] : pending[key] * alpha;
      pending[key] -= step[key];
    }
  }
  if (Object.values(step).some(Boolean)) applyMotion(manager, step);
}