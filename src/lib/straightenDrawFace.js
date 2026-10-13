import { simplifyDrawFacePath } from '@/lib/drawFacePath';

// Fit only long, nearly straight runs. Total least squares averages all samples
// instead of using a shaky endpoint; curved/short runs retain their old outline.
export default function straightenDrawFace(screen, world, axis) {
  const corners = simplifyDrawFacePath(screen, world);
  if (corners.length < 3) return corners;
  const axes = ['x', 'y', 'z'].filter((key) => key !== axis);
  const count = Math.min(screen.length, world.length);
  const end = count > 3 && Math.hypot(screen[0].x - screen[count - 1].x, screen[0].y - screen[count - 1].y) < 24 ? count - 1 : count;
  const indices = corners.map((point) => world.indexOf(point));
  const fitted = corners.map((point, edge) => {
    const start = indices[edge], finish = indices[(edge + 1) % indices.length];
    const samples = [];
    for (let i = start; ; i = (i + 1) % end) {
      samples.push(i);
      if (i === finish || samples.length > end) break;
    }
    const a = screen[start], b = screen[finish];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 40 || samples.length < 4) return null;
    const mean = samples.reduce((m, i) => [m[0] + screen[i].x / samples.length, m[1] + screen[i].y / samples.length], [0, 0]);
    let xx = 0, xy = 0, yy = 0;
    for (const i of samples) { const x = screen[i].x - mean[0], y = screen[i].y - mean[1]; xx += x*x; xy += x*y; yy += y*y; }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const residuals = samples.map((i) => Math.abs(-(screen[i].x - mean[0]) * Math.sin(angle) + (screen[i].y - mean[1]) * Math.cos(angle)));
    const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value*value, 0) / samples.length);
    if (Math.max(...residuals) > Math.max(3, length * 0.035) || rms > Math.max(1.5, length * 0.015)) return null;
    const center = samples.reduce((m, i) => axes.map((key, j) => m[j] + world[i][key] / samples.length), [0, 0]);
    xx = 0; xy = 0; yy = 0;
    for (const i of samples) { const x = world[i][axes[0]] - center[0], y = world[i][axes[1]] - center[1]; xx += x*x; xy += x*y; yy += y*y; }
    let direction = 0.5 * Math.atan2(2 * xy, xx - yy);
    const nearest = Math.round(direction / (Math.PI / 4)) * Math.PI / 4;
    if (Math.abs(nearest - direction) < Math.PI / 45) direction = nearest;
    return { center, normal: [-Math.sin(direction), Math.cos(direction)] };
  });
  return corners.map((point, i) => {
    const before = fitted[(i + corners.length - 1) % corners.length], after = fitted[i];
    if (!before && !after) return point;
    const p = [point[axes[0]], point[axes[1]]];
    const line = after || before;
    const distance = line.normal[0] * (p[0] - line.center[0]) + line.normal[1] * (p[1] - line.center[1]);
    let next = p.map((v, j) => v - distance * line.normal[j]);
    if (before && after) {
      const [a, b] = before.normal, [c, d] = after.normal, det = a*d - b*c;
      if (Math.abs(det) > 0.15) {
        const u = a*before.center[0] + b*before.center[1], v = c*after.center[0] + d*after.center[1];
        next = [(u*d - b*v) / det, (a*v - u*c) / det];
      }
    }
    // Never let a shallow intersection shift a corner far from the stroke.
    const neighbor = corners[(i + 1) % corners.length];
    if (Math.hypot(next[0] - p[0], next[1] - p[1]) > Math.hypot(neighbor[axes[0]] - p[0], neighbor[axes[1]] - p[1]) * 0.15) return point;
    const corrected = point.clone();
    axes.forEach((key, j) => { corrected[key] = next[j]; });
    return corrected;
  });
}