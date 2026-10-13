// Converts a dense freehand stroke into a small set of corner points. The
// resulting face keeps the drawn silhouette while every edge becomes straight.
export function simplifyDrawFacePath(screenPoints, worldPoints, tolerance = 8) {
  const count = Math.min(screenPoints.length, worldPoints.length);
  const points = Array.from({ length: count }, (_, index) => ({
    screen: screenPoints[index],
    world: worldPoints[index],
  }));
  let closed = false;
  if (points.length > 3) {
    const first = points[0].screen;
    const last = points[points.length - 1].screen;
    closed = Math.hypot(first.x - last.x, first.y - last.y) < 24;
    if (closed) points.pop();
  }
  if (points.length <= 3) return points.map((point) => point.world);

  const kept = [0];
  const simplify = (start, end) => {
    const a = points[start].screen;
    const b = points[end].screen;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = start;
    let maxDistance = 0;
    for (let index = start + 1; index < end; index++) {
      const point = points[index].screen;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
      const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
      if (distance > maxDistance) { maxDistance = distance; farthest = index; }
    }
    if (maxDistance > tolerance) {
      simplify(start, farthest);
      simplify(farthest, end);
    } else kept.push(end);
  };
  simplify(0, points.length - 1);
  const indices = [...new Set(kept)];
  if (closed && indices.length > 3) {
    const first = points[indices[0]].screen;
    const previous = points[indices[indices.length - 2]].screen;
    const last = points[indices[indices.length - 1]].screen;
    const dx = first.x - previous.x, dy = first.y - previous.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((last.x - previous.x) * dx + (last.y - previous.y) * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(last.x - (previous.x + t * dx), last.y - (previous.y + t * dy));
    if (distance <= tolerance) indices.pop();
  }
  return indices.map((index) => points[index].world);
}