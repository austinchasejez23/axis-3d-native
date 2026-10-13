import * as THREE from 'three';
import { simplifyDrawFacePath } from '@/lib/drawFacePath';

// Make each simplified edge parallel to the visible axis it most closely follows.
// Work on the drawing plane, so perspective only chooses the axis; it never
// pulls a vertex off that plane.
export default function alignDrawFace(screen, world, axis, camera, viewport) {
  const corners = simplifyDrawFacePath(screen, world);
  if (corners.length < 3) return corners;
  const axes = ['x', 'y', 'z'].filter((key) => key !== axis);
  const points = corners.map((point) => point.clone());
  const directions = corners.map((point, i) => {
    const a = screen[world.indexOf(point)];
    const b = screen[world.indexOf(corners[(i + 1) % corners.length])];
    const vx = b.x - a.x, vy = b.y - a.y;
    const scores = axes.map((key) => {
      const projected = point.clone().project(camera);
      const offset = point.clone().add(new THREE.Vector3(key === 'x' ? 1 : 0, key === 'y' ? 1 : 0, key === 'z' ? 1 : 0)).project(camera);
      const dx = (offset.x - projected.x) * viewport.width;
      const dy = (projected.y - offset.y) * viewport.height;
      return Math.abs(vx * dx + vy * dy) / (Math.hypot(dx, dy) || 1);
    });
    return scores[0] >= scores[1] ? 0 : 1;
  });
  if (directions.every((direction) => direction === directions[0])) return corners;

  // Neighbouring edges with the same direction share one coordinate; their
  // intersection with the next run makes a clean, closed, axis-aligned corner.
  for (let start = 0; start < directions.length; start++) {
    if (directions[start] === directions[(start + directions.length - 1) % directions.length]) continue;
    const run = [];
    let edge = start;
    do {
      run.push(edge);
      edge = (edge + 1) % directions.length;
    } while (edge !== start && directions[edge] === directions[start]);
    run.push(edge);
    const fixed = axes[1 - directions[start]];
    const value = run.reduce((sum, index) => sum + corners[index][fixed], 0) / run.length;
    for (const index of run) points[index][fixed] = value;
  }
  return points;
}