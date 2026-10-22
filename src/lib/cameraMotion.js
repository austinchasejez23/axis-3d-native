import * as THREE from 'three';
import { pulseNavigationResolution } from '@/lib/renderBoost';

// Touch camera: finger movement is queued and eased in over a few frames, so
// the view follows smoothly instead of copying every twitch of the finger.
// On release, orbit, pan and zoom all glide to a stop at the speed they were
// moving. Desktop keeps its own damped displacement.
//
// A touch that may still turn out to be a tap holds its camera movement back
// until it clearly is not one, so a quick tap never moves (and then snaps
// back) the view.
const empty = () => ({ orbitX: 0, orbitY: 0, panX: 0, panY: 0, zoom: 0 });
const KEYS = Object.keys(empty());
const MIN_DISTANCE = 0.05, MAX_DISTANCE = 800;
const TOUCH_ORBIT_RESISTANCE = 0.48;
const TOUCH_PAN_RESISTANCE = 0.8;
const TOUCH_ZOOM_RESISTANCE = 0.85;
const TOUCH_FOLLOW_SECONDS = 0.05; // how far (in time) the view trails the finger
const GLIDE_DECAY = 9;             // per second; the glide fades out in ~0.3 s
const SAMPLE_WINDOW_MS = 90;       // finger speed is measured over this window
const RELEASE_STALE_MS = 80;       // a finger that stopped this long ago doesn't glide
const TAP_MS = 240, TAP_PX = 22;   // the quick-tap test used on release
// Smallest release speed worth a glide, and the fastest glide allowed.
const GLIDE_MIN = { orbit: 55, pan: 80, zoom: 0.15 };
const GLIDE_MAX = { orbit: 850, pan: 2500, zoom: 3 };

function applyMotion(manager, motion) {
  const height = Math.max(1, manager.renderer.domElement.getBoundingClientRect().height);
  const angle = 2 * Math.PI / height;
  const scale = 2 * manager.cameraDist * Math.tan(THREE.MathUtils.degToRad(manager.camera.fov / 2)) / height;
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

const isZero = (m) => !m || KEYS.every((k) => !m[k]);

// The single finger on screen, while it could still be a quick tap.
function tapCandidate(manager, now) {
  if (manager.pointers?.size !== 1 || !manager._quickTapCamera) return false;
  const p = manager.pointers.values().next().value;
  if (!p || p.startTime == null) return false;
  return now - p.startTime < TAP_MS && Math.hypot(p.x - p.startX, p.y - p.startY) < TAP_PX;
}

function flushTapHold(manager) {
  const held = manager._tapHold;
  if (isZero(held)) return;
  const pending = manager._touchPending || (manager._touchPending = empty());
  for (const k of KEYS) pending[k] += held[k];
  manager._tapHold = empty();
}

export function stopCameraMotion(manager) {
  manager._cameraMotion = empty();
  manager._touchPending = empty();
  manager._tapHold = empty();
  manager._touchSamples = [];
  manager._cameraGlide = null;
  manager._cameraLastMoveAt = null;
  manager._cameraOrbitVelocity = null;
  manager._cameraTween = null;
  manager._cameraMotionTime = performance.now();
}

// Glide the orbit pivot and distance to new values (Focus). The viewing angle
// is left alone. Any touch or click on the canvas stops it.
const TWEEN_MS = 380;
export function tweenCameraTo(manager, target, distance) {
  stopCameraMotion(manager);
  manager._cameraTween = {
    fromTarget: manager.cameraTarget.clone(), toTarget: target.clone(),
    fromDist: manager.cameraDist, toDist: THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
    start: performance.now(),
  };
}

function stepCameraTween(manager, now) {
  const tw = manager._cameraTween;
  const t = Math.min(1, (now - tw.start) / TWEEN_MS);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  manager.cameraTarget.lerpVectors(tw.fromTarget, tw.toTarget, e);
  manager.cameraDist = tw.fromDist * Math.pow(tw.toDist / tw.fromDist, e);
  pulseNavigationResolution(manager);
  manager.applyCamera();
  if (t >= 1) manager._cameraTween = null;
}

// Forget the finger-speed history (e.g. when the number of fingers changes),
// without dropping movement that is still easing in.
export function resetCameraTouchSpeed(manager) {
  manager._touchSamples = [];
  manager._cameraGlide = null;
  manager._cameraLastMoveAt = null;
  manager._cameraOrbitVelocity = null;
}

// A quick tap ended: throw away the movement it held back.
export function discardTapMotion(manager) {
  manager._tapHold = empty();
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
  if (isZero(delta)) return;
  manager._cameraGlide = null;
  if (touch) {
    manager.cameraGesture = true;
    const now = performance.now();
    if (tapCandidate(manager, now)) {
      const held = manager._tapHold || (manager._tapHold = empty());
      for (const k of KEYS) held[k] += delta[k];
    } else {
      flushTapHold(manager);
      const pending = manager._touchPending || (manager._touchPending = empty());
      for (const k of KEYS) pending[k] += delta[k];
    }
    const samples = manager._touchSamples || (manager._touchSamples = []);
    samples.push({ t: now, ...delta });
    while (samples.length && now - samples[0].t > 300) samples.shift();
    manager._cameraLastMoveAt = now;
  } else {
    const pending = manager._cameraMotion || (manager._cameraMotion = empty());
    for (const k of KEYS) pending[k] += delta[k];
  }
}

// Last finger lifted: keep gliding at the speed the finger was moving.
export function releaseCameraMotion(manager, now = performance.now()) {
  flushTapHold(manager);
  const samples = (manager._touchSamples || []).filter((s) => now - s.t <= SAMPLE_WINDOW_MS);
  manager._touchSamples = [];
  if (manager._cameraTouchFrozen || !samples.length || now - (manager._cameraLastMoveAt ?? -Infinity) > RELEASE_STALE_MS) return;
  const span = Math.max(16, now - samples[0].t + 16) / 1000;
  const sum = empty();
  for (const s of samples) for (const k of KEYS) sum[k] += s[k];
  const v = empty();
  const orbit = new THREE.Vector2(sum.orbitX, sum.orbitY).divideScalar(span);
  const pan = new THREE.Vector2(sum.panX, sum.panY).divideScalar(span);
  const zoom = sum.zoom / span;
  if (orbit.length() >= GLIDE_MIN.orbit) { orbit.clampLength(0, GLIDE_MAX.orbit); v.orbitX = orbit.x; v.orbitY = orbit.y; }
  if (pan.length() >= GLIDE_MIN.pan) { pan.clampLength(0, GLIDE_MAX.pan); v.panX = pan.x; v.panY = pan.y; }
  if (Math.abs(zoom) >= GLIDE_MIN.zoom) v.zoom = THREE.MathUtils.clamp(zoom, -GLIDE_MAX.zoom, GLIDE_MAX.zoom);
  manager._cameraGlide = isZero(v) ? null : { velocity: v };
  manager._cameraMotionTime = now;
}

export function updateCameraMotion(manager, now = performance.now()) {
  const dt = Math.min(0.033, Math.max(0, (now - (manager._cameraMotionTime ?? now)) / 1000));
  manager._cameraMotionTime = now;
  if (manager._cameraTween) { stepCameraTween(manager, now); return; }
  const step = empty();
  // A held tap that has outlived the tap test is a real drag: let it through.
  if (!isZero(manager._tapHold) && !tapCandidate(manager, now)) flushTapHold(manager);
  // Touch movement eases in, while held and after release alike.
  const pending = manager._touchPending;
  if (!isZero(pending)) {
    const alpha = 1 - Math.exp(-dt / TOUCH_FOLLOW_SECONDS);
    for (const k of KEYS) {
      const take = Math.abs(pending[k]) < 1e-4 ? pending[k] : pending[k] * alpha;
      step[k] += take;
      pending[k] -= take;
    }
  }
  if (!(manager.pointers?.size > 0)) {
    const glide = manager._cameraGlide;
    if (glide) {
      const v = glide.velocity;
      for (const k of KEYS) step[k] += v[k] * dt;
      const fade = Math.exp(-GLIDE_DECAY * dt);
      for (const k of KEYS) v[k] *= fade;
      if (Math.hypot(v.orbitX, v.orbitY) <= 8 && Math.hypot(v.panX, v.panY) <= 12 && Math.abs(v.zoom) <= 0.02) manager._cameraGlide = null;
    }
    const mouse = manager._cameraMotion || (manager._cameraMotion = empty());
    const alpha = 1 - Math.pow(0.95, dt * 60);
    for (const k of KEYS) {
      const take = Math.abs(mouse[k]) < 1e-7 ? mouse[k] : mouse[k] * alpha;
      step[k] += take;
      mouse[k] -= take;
    }
  }
  if (!isZero(step)) applyMotion(manager, step);
}
