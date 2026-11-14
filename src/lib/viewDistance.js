// The distance that sets how large a point draws on screen. In perspective it
// is the point's distance from the camera; the orthographic view draws every
// depth at one scale, set by the orbit distance (kept in userData.viewDistance).
export function viewDistance(camera, point) {
  if (camera.isOrthographicCamera) return camera.userData.viewDistance ?? 1;
  return camera.position.distanceTo(point);
}
