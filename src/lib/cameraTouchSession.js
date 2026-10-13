// Camera lifecycle only: hit testing, selection reach and modeling gestures stay
// in their existing handlers. Multi-touch can hand back to one-finger orbit
// without a full lift, but a short movement dead-zone absorbs release wobble.
export function beginCameraTouch(manager) {
  if (manager.pointers.size === 1) {
    manager._cameraTouchMulti = false;
    manager._cameraTouchFrozen = false;
  } else {
    manager._cameraTouchMulti = true;
    manager._cameraOrbitVelocity = null;
    manager._cameraGlide = null;
  }
  return manager._cameraTouchFrozen && manager.cameraGesture;
}

export function endCameraTouch(manager, event) {
  if (!manager.cameraGesture) return false;
  const remaining = manager.pointers.size - 1;
  if (event.type !== 'pointerup') manager.stopCameraMotion();
  if (remaining > 0) {
    manager.stopCameraMotion();
    if (remaining === 1) {
      const survivor = [...manager.pointers.entries()]
        .find(([id]) => id !== event.pointerId)?.[1];
      manager._cameraTouchMulti = false;
      manager._cameraOrbitVelocity = null;
      manager._cameraLastMoveAt = null;
      manager._cameraHandoffGuard = survivor ? { x: survivor.x, y: survivor.y } : null;
      manager.gesture = 'orbit';
      manager.gestureData = null;
    } else if (remaining === 2) {
      // Resume the same two-finger camera controls from their current positions.
      const [a, b] = [...manager.pointers.entries()]
        .filter(([id]) => id !== event.pointerId).map(([, pointer]) => pointer);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      manager.gesture = 'camera_two';
      manager.gestureData = {
        lastMidX: midX, lastMidY: midY,
        lastDist: Math.hypot(a.x - b.x, a.y - b.y),
      };
    }
  } else {
    manager.releaseCameraMotion();
    manager.cameraGesture = false;
    manager._cameraTouchFrozen = false;
    manager.gesture = null;
    manager.gestureData = null;
    manager._cameraOrbitVelocity = null;
    manager._cameraHandoffGuard = null;
  }
  return true;
}